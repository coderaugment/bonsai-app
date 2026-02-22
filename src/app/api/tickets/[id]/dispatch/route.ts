import { NextResponse } from "next/server";
import { formatTicketSlug } from "@/types";
import { tickets, personas, projects } from "@/db/schema";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { getTicketById, updateTicket } from "@/db/data/tickets";
import { createAgentComment, getRecentCommentsEnriched } from "@/db/data/comments";
import { getDocumentsByTicketVersionDesc } from "@/db/data/documents";
import { getProjectById } from "@/db/data/projects";
import { getProjectPersonasRaw, getAllPersonasRaw } from "@/db/data/personas";
import { getRoleBySlug } from "@/db/data/roles";
import { getSetting } from "@/db/data/settings";
import { logAuditEvent } from "@/db/data/audit";
import { insertAgentRun } from "@/db/data/agent-runs";
import { getRecentProjectMessagesFormatted } from "@/db/data/project-messages";
import { CREDITS_PAUSED_UNTIL, isPaused, pauseRemainingMs } from "@/lib/credit-pause";

// ── Config ──────────────────────────────────────────
const HOME = process.env.HOME || "~";
const CLAUDE_CLI = path.join(HOME, ".local", "bin", "claude");
const MODEL = "opus";
const BONSAI_DIR = path.join(HOME, ".bonsai");
const API_BASE = process.env.API_BASE || "http://localhost:3080";
const BONSAI_CLI = path.join(process.cwd(), "..", "cli", "bonsai-cli.ts");

const TOOLS_READONLY = ["Read", "Grep", "Glob", "Bash"];
const TOOLS_FULL = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"];

// Agent skills directory — skills are discovered via --add-dir, not concatenated into prompts
const AGENTS_DIR = path.join(BONSAI_DIR, "agents");

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const PROJECTS_DIR = path.join(HOME, "development", "bonsai", "projects");

function resolveMainRepo(project: { githubRepo: string | null; slug: string; localPath: string | null }): string {
  if (project.localPath) return path.join(project.localPath, "repo");
  const projectRoot = path.join(PROJECTS_DIR, project.githubRepo || project.slug);
  return path.join(projectRoot, "repo");
}

function resolveProjectRoot(project: { githubRepo: string | null; slug: string; localPath: string | null }): string {
  if (project.localPath) return project.localPath;
  return path.join(PROJECTS_DIR, project.githubRepo || project.slug);
}

function ensureWorktree(
  project: { githubRepo: string | null; slug: string; localPath: string | null },
  ticketSlug: string
): string {
  const mainRepo = resolveMainRepo(project);
  if (!fs.existsSync(mainRepo)) return mainRepo;

  const gitDir = path.join(mainRepo, ".git");
  if (!fs.existsSync(gitDir)) return mainRepo;

  // Worktrees live at {projectRoot}/worktrees/{ticketSlug}
  const projectRoot = resolveProjectRoot(project);
  const worktreesDir = path.join(projectRoot, "worktrees");
  const worktreePath = path.join(worktreesDir, ticketSlug);
  const branchName = `ticket/${ticketSlug}`;

  if (fs.existsSync(worktreePath)) return worktreePath;

  // Create worktrees directory if needed
  fs.mkdirSync(worktreesDir, { recursive: true });

  try {
    const opts = { cwd: mainRepo, encoding: "utf-8" as const, stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"] };

    // Create branch if it doesn't exist
    try {
      execFileSync("git", ["rev-parse", "--verify", branchName], opts);
    } catch {
      execFileSync("git", ["branch", branchName], opts);
    }

    execFileSync("git", ["worktree", "add", worktreePath, branchName], opts);
    console.log(`[dispatch] Created worktree at ${worktreePath}`);
    return worktreePath;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[dispatch] Worktree creation failed: ${msg.slice(0, 200)}`);
    return mainRepo;
  }
}

// ── Per-persona dispatch cooldown ──────────────────────
// Tracks recent dispatches to prevent duplicate agent runs.
// Key: "ticketId:personaId" → timestamp
const recentDispatches = new Map<string, number>();
const PERSONA_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes (auto-dispatch chains)
const MENTION_COOLDOWN_MS = 30 * 1000; // 30 seconds (direct human @mentions)

function isPersonaOnCooldown(ticketId: number, personaId: string, isDirectMention = false): boolean {
  const key = `${ticketId}:${personaId}`;
  const last = recentDispatches.get(key);
  if (!last) return false;
  const cooldown = isDirectMention ? MENTION_COOLDOWN_MS : PERSONA_COOLDOWN_MS;
  return Date.now() - last < cooldown;
}

function markPersonaDispatched(ticketId: number, personaId: string) {
  const key = `${ticketId}:${personaId}`;
  recentDispatches.set(key, Date.now());
  // Prune old entries every 100 dispatches
  if (recentDispatches.size > 100) {
    const cutoff = Date.now() - PERSONA_COOLDOWN_MS;
    for (const [k, v] of recentDispatches) {
      if (v < cutoff) recentDispatches.delete(k);
    }
  }
}

// ── Agent Spawn (fire-and-forget, posts back when done) ──
function spawnAgent(
  sessionDir: string,
  cwd: string,
  tools: string[],
  ticketId: number,
  personaId: string,
  opts?: { conversational?: boolean; documentId?: number; role?: string }
) {
  const taskFile = path.join(sessionDir, "task.md");
  const outputFile = path.join(sessionDir, "output.md");
  const stderrFile = path.join(sessionDir, "stderr.log");
  const promptFile = path.join(sessionDir, "system-prompt.txt");

  // EPIC FEATURES DISABLED - set-epic.sh and create-sub-ticket.sh removed
  // // Write set-epic helper script (lead can promote a ticket to epic)
  // const setEpicScript = path.join(sessionDir, "set-epic.sh");
  // fs.writeFileSync(setEpicScript, [
  //   `#!/usr/bin/env node`,
  //   `fetch("${API_BASE}/api/tickets", {`,
  //   `  method: "PUT",`,
  //   `  headers: { "Content-Type": "application/json" },`,
  //   `  body: JSON.stringify({ ticketId: ${ticketId}, isEpic: true }),`,
  //   `}).then(r => r.json()).then(d => {`,
  //   `  if (d.ok) console.log("Marked ticket ${ticketId} as epic.");`,
  //   `  else console.error("Failed:", d.error);`,
  //   `}).catch(e => console.error(e));`,
  //   `]).join("\n"));
  // fs.chmodSync(setEpicScript, 0o755);

  // // Write create-sub-ticket helper script (for epic breakdown)
  // // Accepts a JSON file path: { title, type?, description?, acceptanceCriteria? }
  // const createSubTicketScript = path.join(sessionDir, "create-sub-ticket.sh");
  // fs.writeFileSync(createSubTicketScript, [
  //   `#!/usr/bin/env node`,
  //   `const fs = require("fs");`,
  //   `const file = process.argv[2];`,
  //   `if (!file) { console.error("Usage: create-sub-ticket.sh <json-file>"); console.error("JSON: { title, type?, description?, acceptanceCriteria? }"); process.exit(1); }`,
  //   `let data;`,
  //   `try { data = JSON.parse(fs.readFileSync(file, "utf-8")); } catch(e) { console.error("Failed to read/parse JSON:", e.message); process.exit(1); }`,
  //   `if (!data.title) { console.error("JSON must include 'title'"); process.exit(1); }`,
  //   `fetch("${API_BASE}/api/tickets", {`,
  //   `  method: "POST",`,
  //   `  headers: { "Content-Type": "application/json" },`,
  //   `  body: JSON.stringify({ title: data.title, type: data.type || "feature", description: data.description || "", acceptanceCriteria: data.acceptanceCriteria || "", epicId: ${ticketId} }),`,
  //   `}).then(r => r.json()).then(d => {`,
  //   `  if (d.success) console.log("Created sub-ticket: " + d.ticket.id + " — " + data.title);`,
  //   `  else console.error("Failed:", d.error);`,
  //   `}).catch(e => console.error(e));`,
  //   `]).join("\n"));
  // fs.chmodSync(createSubTicketScript, 0o755);

  // credit-status.sh - check if API credits are paused
  const creditStatusScript = path.join(sessionDir, "credit-status.sh");
  const webappDir = path.join(process.cwd()); // webapp root
  fs.writeFileSync(creditStatusScript, [
    `#!/bin/bash`,
    `cd ${shellEscape(webappDir)} && \\`,
    `BONSAI_API_BASE="${API_BASE}" NODE_PATH=./node_modules \\`,
    `npx tsx ${BONSAI_CLI} credit-status`,
  ].join("\n"));
  fs.chmodSync(creditStatusScript, 0o755);

  // bonsai-cli wrapper - makes CLI available as "bonsai-cli" command
  const bonsaiCliWrapper = path.join(sessionDir, "bonsai-cli");
  fs.writeFileSync(bonsaiCliWrapper, [
    `#!/bin/bash`,
    `# Unified Bonsai CLI wrapper`,
    `cd ${shellEscape(webappDir)} && \\`,
    `BONSAI_ENV=dev BONSAI_PERSONA_ID="${personaId}" BONSAI_API_BASE="${API_BASE}" BONSAI_DB_DIR="${webappDir}" NODE_PATH=./node_modules \\`,
    `exec npx tsx ${BONSAI_CLI} "$@"`,
  ].join("\n"));
  fs.chmodSync(bonsaiCliWrapper, 0o755);

  // Create symlink in worktree so agents can run ./bonsai-cli from their cwd
  const bonsaiCliSymlink = path.join(cwd, "bonsai-cli");
  try {
    if (fs.existsSync(bonsaiCliSymlink)) {
      const stats = fs.lstatSync(bonsaiCliSymlink);
      if (stats.isSymbolicLink() || stats.isFile()) {
        fs.unlinkSync(bonsaiCliSymlink);
      }
    }
    fs.symlinkSync(bonsaiCliWrapper, bonsaiCliSymlink);
  } catch (err: any) {
    // If symlink already exists and unlink failed, try to continue
    if (err.code !== 'EEXIST') throw err;
  }

  // Build --add-dir flags for skill discovery
  const addDirFlags: string[] = [];
  const sharedSkillsDir = path.join(AGENTS_DIR, "_shared");
  if (fs.existsSync(sharedSkillsDir)) {
    addDirFlags.push(`--add-dir ${shellEscape(sharedSkillsDir)}`);
  }
  const role = opts?.role || "developer";
  const roleSkillsDir = path.join(AGENTS_DIR, role);
  if (fs.existsSync(roleSkillsDir)) {
    addDirFlags.push(`--add-dir ${shellEscape(roleSkillsDir)}`);
  }

  const claudeCmd = [
    `cat ${shellEscape(taskFile)} |`,
    shellEscape(CLAUDE_CLI),
    `-p`,
    `--model ${MODEL}`,
    `--allowedTools "${tools.join(",")}"`,
    `--output-format json`,
    `--no-session-persistence`,
    `--append-system-prompt "$(cat ${shellEscape(promptFile)})"`,
    ...addDirFlags,
    `> ${shellEscape(outputFile)} 2> ${shellEscape(stderrFile)}`,
  ].join(" ");

  // After claude finishes, post the output to agent-complete endpoint
  const postScriptFile = path.join(sessionDir, "post-output.mjs");
  fs.writeFileSync(postScriptFile, [
    `import fs from "fs";`,
    `const stderrContent = fs.existsSync(${JSON.stringify(stderrFile)}) ? fs.readFileSync(${JSON.stringify(stderrFile)}, "utf-8") : "";`,
    `const stdoutContent = fs.existsSync(${JSON.stringify(outputFile)}) ? fs.readFileSync(${JSON.stringify(outputFile)}, "utf-8") : "";`,
    `const allOutput = stderrContent + " " + stdoutContent;`,
    `// Check for OAuth token expiry (401 auth error) — trigger autonomous Chrome re-auth`,
    `if (/OAuth token has expired|authentication_error|Failed to authenticate|Please obtain a new token/i.test(allOutput)) {`,
    `  try {`,
    `    const reauthRes = await fetch(${JSON.stringify(`${API_BASE}/api/auth/reauth`)}, {`,
    `      method: "POST",`,
    `      headers: { "Content-Type": "application/json" },`,
    `      body: "{}",`,
    `    });`,
    `    const reauthBody = await reauthRes.json();`,
    `    fs.writeFileSync(${JSON.stringify(path.join(sessionDir, "post-error.log"))}, "Auth expired — " + (reauthBody.message || reauthBody.error || "re-auth triggered"));`,
    `  } catch (e) {`,
    `    fs.writeFileSync(${JSON.stringify(path.join(sessionDir, "post-error.log"))}, "Auth expired but failed to trigger reauth: " + String(e));`,
    `  }`,
    `  process.exit(0);`,
    `}`,
    `// Check stderr for credit limit errors before processing output`,
    `if (stderrContent && /hit your limit|rate limit|out of credits|\\b429\\b|quota exceeded/i.test(stderrContent)) {`,
    `  try {`,
    `    await fetch(${JSON.stringify(`${API_BASE}/api/credit-pause`)}, {`,
    `      method: "POST",`,
    `      headers: { "Content-Type": "application/json" },`,
    `      body: JSON.stringify({ reason: stderrContent.slice(0, 500) }),`,
    `    });`,
    `    fs.writeFileSync(${JSON.stringify(path.join(sessionDir, "post-error.log"))}, "Credit limit detected — pause activated");`,
    `  } catch (e) {`,
    `    fs.writeFileSync(${JSON.stringify(path.join(sessionDir, "post-error.log"))}, "Credit limit detected but failed to set pause: " + String(e));`,
    `  }`,
    `  process.exit(0);`,
    `}`,
    `const raw = fs.readFileSync(${JSON.stringify(outputFile)}, "utf-8").trim();`,
    `if (!raw) {`,
    `  fs.writeFileSync(${JSON.stringify(path.join(sessionDir, "post-error.log"))}, "Empty output file — agent produced no output");`,
    `  process.exit(0);`,
    `}`,
    `let output;`,
    `try {`,
    `  const json = JSON.parse(raw);`,
    `  output = json.result || "";`,
    `  if (!output && json.is_error) {`,
    `    output = "I encountered an error while working on this task: " + (json.result || "unknown error");`,
    `  }`,
    `} catch {`,
    `  output = raw;`,
    `}`,
    `if (!output?.trim()) {`,
    `  fs.writeFileSync(${JSON.stringify(path.join(sessionDir, "post-error.log"))}, "Agent produced no text output (result field empty) — skipping post to agent-complete");`,
    `  process.exit(0);`,
    `}`,
    `try {`,
    `  const res = await fetch(${JSON.stringify(`${API_BASE}/api/tickets/${ticketId}/agent-complete`)}, {`,
    `    method: "POST",`,
    `    headers: { "Content-Type": "application/json" },`,
    `    body: JSON.stringify({ personaId: ${JSON.stringify(personaId)}, content: output, conversational: ${!!opts?.conversational}, documentId: ${opts?.documentId ? opts.documentId : "null"} }),`,
    `  });`,
    `  const body = await res.text();`,
    `  fs.writeFileSync(${JSON.stringify(path.join(sessionDir, "post-result.log"))}, res.status + " " + body);`,
    `} catch (e) {`,
    `  fs.writeFileSync(${JSON.stringify(path.join(sessionDir, "post-error.log"))}, String(e));`,
    `}`,
  ].join("\n"));
  const postScript = `node ${shellEscape(postScriptFile)}`;

  const child = spawn("sh", ["-c", `${claudeCmd} ; ${postScript}`], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, DISABLE_AUTOUPDATER: "1", CLAUDECODE: "", GEMINI_API_KEY: process.env.GEMINI_API_KEY || "" },
  });
  child.unref();
}

// ── Helpers ──────────────────────────────────────────
async function postAgentComment(ticketId: number, personaId: string, content: string) {
  await createAgentComment(ticketId, personaId, content);
}

async function toolsForRole(role: string): Promise<string[]> {
  // Read-only roles
  if (role === "researcher") return TOOLS_READONLY;
  if (role === "critic") return TOOLS_READONLY;

  // Check DB for role-specific tools
  const roleRow = await getRoleBySlug(role);
  if (roleRow?.tools) {
    try { return JSON.parse(roleRow.tools); } catch {}
  }
  return TOOLS_FULL;
}

// Resolve phase label for agent run tracking
function resolvePhaseForRun(ticket: typeof tickets.$inferSelect): string {
  if (ticket.state === "review") return "review";
  if (ticket.planApprovedAt) return "implementation";      // Plan approved = building
  if (ticket.researchApprovedAt) return "planning";        // Research approved = planning
  return "research";                                        // Nothing approved = research
}

// Determine which role should handle based on ticket state
function resolveTargetRole(ticket: typeof tickets.$inferSelect): string | null {
  // Planning column → researcher owns it
  if (ticket.state === "planning") {
    // 1. Research (researcher does initial investigation)
    if (!ticket.researchCompletedAt) return "researcher";
    // 2. Implementation plan (developer creates the plan after research)
    return "developer";
  }
  // Building phase → developer implements the code
  if (ticket.state === "building") return "developer";
  // Preview, test, shipped → human owns these columns (no auto-dispatch)
  return null;
}

// ── Fetch ticket context ─────────────────────────────
async function getTicketContext(ticketId: number) {
  const enrichedComments = await getRecentCommentsEnriched(ticketId, 10);
  const docs = await getDocumentsByTicketVersionDesc(ticketId);

  const researchDoc = docs.find((d) => d.type === "research");
  const implPlan = docs.find((d) => d.type === "implementation_plan");
  const researchCritique = docs.find((d) => d.type === "research_critique");
  const planCritique = docs.find((d) => d.type === "plan_critique");

  return { enrichedComments, researchDoc, implPlan, researchCritique, planCritique };
}

// ── POST /api/tickets/[id]/dispatch ──────────────────
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);
  const ticketSlug = formatTicketSlug(ticketId);

  // ── Credit pause gate ───────────────────────────
  const pausedUntil = await getSetting(CREDITS_PAUSED_UNTIL);
  if (isPaused(pausedUntil)) {
    const remainingMs = pauseRemainingMs(pausedUntil);
    console.log(`[dispatch] Rejecting — credits paused until ${pausedUntil}`);
    return NextResponse.json(
      { error: "credits_paused", resumesAt: pausedUntil, remainingMs },
      { status: 503 }
    );
  }

  const { commentContent, targetRole: requestedRole, targetPersonaName, targetPersonaId, team, silent, conversational, documentId, urgent } = await req.json();

  if (conversational) {
    console.log(`[dispatch] Conversational dispatch for ${ticketId}, documentId=${documentId}, targetPersonaId=${targetPersonaId}`);
  }

  const ticket = await getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const project = ticket.projectId
    ? await getProjectById(ticket.projectId)
    : null;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Get all non-deleted personas for this project
  const projectPersonas = await getProjectPersonasRaw(project.id);

  // Handle @team dispatch — send to all project agents.
  // Also treat non-mentioned human comments as team dispatch so all personas see them.
  const isUnmentionedHumanComment = !team && !targetPersonaName && !targetPersonaId && !requestedRole && !!commentContent?.trim();
  if ((team || isUnmentionedHumanComment) && projectPersonas.length > 0) {
    const cwd = ensureWorktree(project, ticketSlug);
    if (!fs.existsSync(cwd)) {
      fs.mkdirSync(cwd, { recursive: true });
      console.warn(`[dispatch] Created missing workspace: ${cwd}`);
    }

    const dispatched: Array<{ id: string; name: string; role: string | null; color: string | null; avatarUrl: string | null }> = [];

    // @team dispatches relevant roles only (not designer/hacker/researcher unless in their phase)
    // Non-mentioned human comments go to column owner (researcher in planning, developer in build/test)
    let dispatchTargets = projectPersonas;
    if (isUnmentionedHumanComment) {
      const inBuildOrTest = !!ticket.planApprovedAt;
      const targetRole = inBuildOrTest ? "developer" : "researcher";
      dispatchTargets = projectPersonas.filter((p) => p.role === targetRole);
    } else if (team) {
      // @team: only dispatch roles relevant to the current phase
      const inResearch = !ticket.researchApprovedAt;
      const inPlanning = !!ticket.researchApprovedAt && !ticket.planApprovedAt;
      const inReview = ticket.state === "review";
      const inBuild = !!ticket.planApprovedAt && !inReview;
      const relevantRoles = new Set<string>();
      if (inResearch) { relevantRoles.add("researcher"); relevantRoles.add("critic"); }
      if (inPlanning) { relevantRoles.add("developer"); relevantRoles.add("critic"); relevantRoles.add("hacker"); }
      if (inBuild) { relevantRoles.add("developer"); relevantRoles.add("hacker"); }
      if (inReview) { relevantRoles.add("developer"); relevantRoles.add("hacker"); relevantRoles.add("critic"); }
      dispatchTargets = projectPersonas.filter((p) => relevantRoles.has(p.role || ""));
    }

    // Filter out personas on cooldown
    dispatchTargets = dispatchTargets.filter((p) => !isPersonaOnCooldown(ticketId, p.id));
    if (dispatchTargets.length === 0) {
      return NextResponse.json({ team: true, personas: [], persona: null, skipped: "all on cooldown" });
    }

    for (const persona of dispatchTargets) {
      const sessionDir = path.join(BONSAI_DIR, "sessions", `${ticketSlug}-agent-${Date.now()}-${persona.id}`);
      fs.mkdirSync(sessionDir, { recursive: true });

      fs.writeFileSync(
        path.join(sessionDir, "system-prompt.txt"),
        await buildAgentSystemPrompt(persona, project, ticket, sessionDir, projectPersonas)
      );
      fs.writeFileSync(
        path.join(sessionDir, "task.md"),
        await assembleAgentTask(commentContent, ticket, persona, { conversational })
      );

      const personaTools = await toolsForRole(persona.role || "developer");
      spawnAgent(sessionDir, cwd, personaTools, ticketId, persona.id, { conversational, documentId, role: persona.role || "developer" });
      markPersonaDispatched(ticketId, persona.id);

      insertAgentRun({
        ticketId,
        personaId: persona.id,
        phase: conversational ? "conversational" : resolvePhaseForRun(ticket),
        tools: personaTools,
        sessionDir,
        dispatchSource: "api",
      });

      dispatched.push({
        id: persona.id,
        name: persona.name,
        role: persona.role,
        color: persona.color,
        avatarUrl: persona.avatar,
      });

      await logAuditEvent({
        ticketId,
        event: "agent_dispatched",
        actorType: "system",
        actorName: "System",
        detail: `Dispatched ${persona.name} (${persona.role}) via @team`,
        metadata: { personaId: persona.id, role: persona.role, team: true },
      });
    }

    // Post a single comment about the team dispatch
    if (!silent) {
      const teamNames = dispatched.map(p => p.name).join(", ");
      await postAgentComment(ticketId, dispatched[0].id, `👥 Team dispatch: ${teamNames} are looking into this.`);
    }

    // Update last activity (use first persona as assignee for tracking)
    await updateTicket(ticketId, { lastAgentActivity: new Date().toISOString(), assigneeId: dispatched[0].id });

    return NextResponse.json({
      team: true,
      personas: dispatched,
      persona: dispatched[0], // For backward compat with UI expecting single persona
    });
  }

  // Cooldown: don't dispatch a new agent if one was just dispatched and no explicit target given
  const hasExplicitTarget = targetPersonaName || targetPersonaId || requestedRole;
  if (!hasExplicitTarget && ticket.lastAgentActivity) {
    const elapsed = Date.now() - new Date(ticket.lastAgentActivity).getTime();
    const COOLDOWN_MS = 120_000; // 2 minutes
    if (elapsed < COOLDOWN_MS) {
      console.log(`[dispatch] Skipping — agent active ${Math.round(elapsed / 1000)}s ago, no explicit target`);
      const assignee = ticket.assigneeId
        ? projectPersonas.find((p) => p.id === ticket.assigneeId)
        : null;
      return NextResponse.json({
        skipped: true,
        reason: "agent_active",
        persona: assignee ? { id: assignee.id, name: assignee.name, role: assignee.role, color: assignee.color, avatarUrl: assignee.avatar || undefined } : null,
      });
    }
  }

  // Route: direct persona ID > @mention by name > explicit targetRole > auto-routing by ticket state
  let targetPersona = targetPersonaId
    ? projectPersonas.find((p) => p.id === targetPersonaId)
    : targetPersonaName
    ? projectPersonas.find((p) => p.name.toLowerCase() === targetPersonaName.toLowerCase())
    : undefined;

  // If @mention target not found in project, try all personas (handles cross-project scoping issues)
  // Skip personas with no projectId — those are orphan defaults and shouldn't be dispatched.
  if (!targetPersona && targetPersonaName) {
    const allPersonas = await getAllPersonasRaw();
    const globalMatch = allPersonas.find(
      (p) => p.name.toLowerCase() === targetPersonaName.toLowerCase() && p.projectId != null
    );
    if (globalMatch) {
      console.warn(`[dispatch] @${targetPersonaName} not in project ${project.id} personas (${projectPersonas.map(p => p.name).join(", ")}). Found globally as ${globalMatch.id} (project ${globalMatch.projectId}).`);
      targetPersona = globalMatch;
    } else {
      console.warn(`[dispatch] @${targetPersonaName} not found anywhere. Falling back to role-based routing.`);
    }
  }

  if (!targetPersona) {
    const targetRole = requestedRole || resolveTargetRole(ticket);

    // If no role can be resolved (preview/test/shipped are human-owned), skip dispatch
    if (!targetRole) {
      console.log(`[dispatch] No auto-dispatch for ${ticket.state} state — human owns this column`);
      return NextResponse.json({
        skipped: true,
        reason: "human_owned_column",
        state: ticket.state
      });
    }

    console.log(`[dispatch] Role-based routing: ${targetRole} for ticket ${ticketId} (project personas: ${projectPersonas.map(p => `${p.name}/${p.role}`).join(", ")})`);
    targetPersona = projectPersonas.find((p) => p.role === targetRole)
      || projectPersonas.find((p) => p.role === "developer")
      || projectPersonas[0];
  }

  if (!targetPersona) {
    return NextResponse.json({ error: "No personas available" }, { status: 400 });
  }

  // Per-persona cooldown: 30s for direct human @mentions, 5 min for auto-dispatch chains
  // Skip cooldown for urgent dispatches (plan approval, research completion)
  const isDirectMention = !!targetPersonaName;
  if (!urgent && isPersonaOnCooldown(ticketId, targetPersona.id, isDirectMention)) {
    const cd = isDirectMention ? "30s" : "5 min";
    console.log(`[dispatch] Skipping ${targetPersona.name} — dispatched to ${ticketId} within last ${cd}`);
    return NextResponse.json({
      persona: { id: targetPersona.id, name: targetPersona.name, role: targetPersona.role, color: targetPersona.color },
      skipped: "persona_cooldown",
    });
  }

  const cwd = ensureWorktree(project, ticketSlug);

  // Ensure workspace exists — create if missing so agent doesn't silently fail
  if (!fs.existsSync(cwd)) {
    fs.mkdirSync(cwd, { recursive: true });
    console.warn(`[dispatch] Created missing workspace: ${cwd}`);
  }

  // Create agent session (include personaId to prevent race conditions with parallel dispatches)
  const sessionDir = path.join(BONSAI_DIR, "sessions", `${ticketSlug}-agent-${Date.now()}-${targetPersona.id}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  fs.writeFileSync(
    path.join(sessionDir, "system-prompt.txt"),
    await buildAgentSystemPrompt(targetPersona, project, ticket, sessionDir, projectPersonas)
  );
  fs.writeFileSync(
    path.join(sessionDir, "task.md"),
    await assembleAgentTask(commentContent, ticket, targetPersona, { conversational, mentioned: isDirectMention })
  );

  // Spawn the agent (fire-and-forget, posts comment when done)
  const targetTools = await toolsForRole(targetPersona.role || "developer");
  spawnAgent(sessionDir, cwd, targetTools, ticketId, targetPersona.id, { conversational, documentId, role: targetPersona.role || "developer" });
  markPersonaDispatched(ticketId, targetPersona.id);

  insertAgentRun({
    ticketId,
    personaId: targetPersona.id,
    phase: conversational ? "conversational" : resolvePhaseForRun(ticket),
    tools: targetTools,
    sessionDir,
    dispatchSource: "api",
  });

  // Post a brief "working on it" comment (skip for silent/auto dispatches)
  const ackMsg = `Looking into this now.`;
  if (!silent) {
    await postAgentComment(ticketId, targetPersona.id, ackMsg);
  }

  await logAuditEvent({
    ticketId,
    event: "agent_dispatched",
    actorType: "system",
    actorName: "System",
    detail: `Dispatched ${targetPersona.name} (${targetPersona.role})`,
    metadata: { personaId: targetPersona.id, role: targetPersona.role },
  });

  // Set last_agent_activity to prevent heartbeat overlap
  await updateTicket(ticketId, { lastAgentActivity: new Date().toISOString(), assigneeId: targetPersona.id });

  return NextResponse.json({
    persona: {
      id: targetPersona.id,
      name: targetPersona.name,
      role: targetPersona.role,
      color: targetPersona.color,
      avatarUrl: targetPersona.avatar || undefined,
    },
    pmComment: {
      id: Date.now(),
      ticketId,
      authorType: "agent" as const,
      author: {
        name: targetPersona.name,
        avatarUrl: targetPersona.avatar || undefined,
        color: targetPersona.color,
        role: targetPersona.role || undefined,
      },
      content: ackMsg,
      createdAt: new Date().toISOString(),
    },
  });
}

// ── System prompt builder ────────────────────────────
async function buildAgentSystemPrompt(
  persona: typeof personas.$inferSelect,
  project: typeof projects.$inferSelect,
  ticket: typeof tickets.$inferSelect,
  sessionDir: string,
  teamMembers: (typeof personas.$inferSelect)[] = []
): Promise<string> {
  const workspace = ensureWorktree(project, formatTicketSlug(ticket.id));
  // EPIC FEATURES DISABLED
  // const createSubTicketScript = path.join(sessionDir, "create-sub-ticket.sh");
  // const setEpicScript = path.join(sessionDir, "set-epic.sh");

  // Role instructions: read from roles table (editable in Settings > Roles)
  const role = persona.role || "developer";
  const roleRow = await getRoleBySlug(role);
  const roleInstructions = roleRow?.systemPrompt
    || await getSetting(`prompt_role_${role}`)
    || `You are a ${role}. Follow your role's responsibilities for this project.`;

  // Tool/capability mappings by role
  const roleCapabilities: Record<string, string[]> = {
    researcher: [
      "Read, Grep, Glob (read-only file access)",
      "Bash (read-only commands)",
      "./bonsai-cli report (post progress updates)",
      "./bonsai-cli write-artifact (save research/plan/design documents)",
    ],
    developer: [
      "Read, Write, Edit, Grep, Glob (full file access)",
      "Bash (full command access)",
      "Git (status, diff, commit, push)",
      "./bonsai-cli report (post progress updates)",
      "./bonsai-cli check-criteria (mark acceptance criteria complete)",
      "./bonsai-cli write-artifact (save research/plan/design documents)",
      "apply_transparency (remove grey backgrounds from images)",
    ],
    designer: [
      "Read, Write, Edit, Grep, Glob (full file access)",
      "Bash (full command access)",
      "nano_banana (AI image generation via Gemini)",
      "apply_transparency (remove grey backgrounds from images)",
      "./bonsai-cli report (post progress updates)",
      "./bonsai-cli write-artifact (save research/plan/design documents)",
    ],
    hacker: [
      "Read, Write, Edit, Grep, Glob (full file access)",
      "Bash (full command access)",
      "Git (status, diff, commit, push)",
      "./bonsai-cli report (post progress updates)",
      "./bonsai-cli write-artifact (save research/plan/design documents)",
      "apply_transparency (remove grey backgrounds from images)",
    ],
    critic: [
      "Read, Grep, Glob (read-only file access)",
      "Bash (read-only commands)",
      "./bonsai-cli report (post progress updates)",
      "./bonsai-cli write-artifact (save research/plan/design documents)",
    ],
  };

  const capabilities = roleCapabilities[role] || roleCapabilities.developer;

  const timestamp = new Date().toISOString();
  const projectRoot = resolveProjectRoot(project);
  const mainRepo = resolveMainRepo(project);

  return [
    `You are ${persona.name}, working on project "${project.name}".`,
    `Workspace: ${workspace}`,
    `Project Root: ${projectRoot}`,
    `Main Repository: ${mainRepo}`,
    `Session started: ${timestamp}`,
    "",
    "CRITICAL WORKSPACE RULES — HARD BOUNDARIES:",
    `- Your workspace is: ${workspace}`,
    `- Your project root is: ${projectRoot}`,
    `- Main repository code is at: ${mainRepo}`,
    "",
    "YOU ARE JAILED TO YOUR PROJECT DIRECTORY:",
    `- You are ONLY allowed to read, write, or execute files inside: ${projectRoot}`,
    `- You CANNOT access other projects in /Users/michaeloneal/development/bonsai/projects/`,
    `- You CANNOT access parent directories like /Users/michaeloneal/development/bonsai/`,
    `- You CANNOT access system files or other locations on the machine`,
    `- Even if you see a path like ${projectRoot}/../other-project, you MUST NOT access it`,
    "- Reading files OUTSIDE your project root is STRICTLY FORBIDDEN for ANY reason.",
    "- Do NOT use ../ or any path that escapes your project directory.",
    "- Do NOT use absolute paths like /Users/michaeloneal/development/bonsai/webapp/ (unless inside your project)",
    "",
    "BOUNDARY ENFORCEMENT:",
    `- If a Read/Glob/Grep call would target a path outside ${projectRoot}, DO NOT make that call. Stop.`,
    `- If a Bash command would access files outside ${projectRoot}, DO NOT run it.`,
    `- If you need to reference the Bonsai webapp code, you CANNOT — that is outside your project.`,
    "- If your workspace is empty or has only a README, that is NORMAL — this is a new/greenfield project.",
    "- There is other software on this machine (the Bonsai orchestration system, other apps). You are NOT allowed to read them.",
    "",
    "VIOLATION CONSEQUENCES:",
    "- Reading files outside your project will cause incorrect research and wrong technology assumptions.",
    "- You will receive an error or be terminated if you attempt to access files outside your project.",
    "",
    "EVIDENCE-BASED WORK — MANDATORY:",
    "- NEVER make claims about the codebase, technology versions, or project state without citing evidence from actual files you have read.",
    "- For every factual claim, cite the source: file path, line number, or command output that proves it.",
    "- If you haven't read a file, you don't know what's in it. Read it first, then make claims.",
    "- Do NOT rely on training data for version numbers, API signatures, or library behavior. Check package.json, lock files, and actual source code.",
    "- If you're unsure about something, say so explicitly rather than guessing. \"I did not verify this\" is better than a confident wrong answer.",
    "- Your training data has a knowledge cutoff and WILL be wrong about recent releases. Always verify against the actual project files.",
    persona.personality ? `\nPersonality:\n${persona.personality}` : "",
    "",
    "## Your Team",
    "These are the people on this project. Use @name in your chat messages to hand off or request help.",
    ...teamMembers.map((p) => {
      const you = p.id === persona.id ? " (you)" : "";
      const skills = p.skills ? ` — skills: ${p.skills}` : "";
      return `- **${p.name}** (${p.role || "member"})${you}${skills}`;
    }),
    "",
    "## Your Capabilities",
    "When asked what tools or capabilities you have, here is what you can do:",
    ...capabilities.map(cap => `- ${cap}`),
    "",
    roleInstructions,
    "",
    `## Ticket: ${ticket.id} — ${ticket.title}`,
    `State: ${ticket.state} | Type: ${ticket.type}`,
    "",
    "## Progress Reporting",
    `You MUST report progress to the ticket thread as you work using: \`./bonsai-cli report ${ticket.id} "your message"\``,
    "Post a report when you:",
    "- **Start investigating** a new area (e.g. \"Examining auth middleware in src/middleware.ts\")",
    "- **Find something significant** (e.g. \"Found that session tokens are stored in localStorage, not httpOnly cookies\")",
    "- **Complete a major step** (e.g. \"Finished analyzing the database schema — 3 tables involved\")",
    "- **Make a decision** (e.g. \"Going with approach B: adding a new API route instead of modifying the existing one\")",
    "- **Hit a blocker or uncertainty** (e.g. \"Not sure if we need to handle the legacy format — flagging for review\")",
    "Keep reports short (1-3 sentences). They form the audit trail of your work.",
    "",
    "## Saving Documents",
    "When you produce a research document, implementation plan, or design document, you MUST save it using the bonsai-cli tool.",
    "1. Write your document to a file (e.g. /tmp/research.md)",
    `2. Run: \`./bonsai-cli write-artifact ${ticket.id} <type> <file>\``,
    "   Types: research, implementation_plan, design",
    `   Example: \`./bonsai-cli write-artifact ${ticket.id} research /tmp/research.md\``,
    "3. Your final chat response should be a brief summary (1-2 sentences), NOT the full document.",
    "",
    "CRITICAL: Do NOT output the full document as your response. Save it with ./bonsai-cli. Your response is just a chat message.",
    "",
    "Note: ./bonsai-cli is available in your current directory and configured automatically for this ticket.",
    "",
    // EPIC FEATURES DISABLED - removed epic evaluation and breakdown instructions
    // "## Epic Evaluation & Breakdown",
    // "When evaluating a new ticket, decide: is this a single focused work item, or should it be an epic broken into sub-tickets?",
    // "If the ticket describes a large feature with multiple distinct phases, components, or deliverables, it should be an epic.",
    // "",
    // "### Marking as Epic",
    // `To mark this ticket as an epic: \`${setEpicScript}\``,
    // "",
    // "### Creating Sub-tickets",
    // "After marking as epic, break it down. Write a JSON file for each sub-ticket, then call the script:",
    // "",
    // "```json",
    // "// /tmp/sub-ticket-1.json",
    // "{",
    // '  "title": "Short descriptive title",',
    // '  "type": "feature",',
    // '  "description": "What needs to be built and why.",',
    // '  "acceptanceCriteria": "- [ ] First criterion\\n- [ ] Second criterion\\n- [ ] Third criterion"',
    // "}",
    // "```",
    // `\`${createSubTicketScript} /tmp/sub-ticket-1.json\``,
    // "",
    // "Types: feature, bug, chore.",
    // "CRITICAL: Every sub-ticket MUST include acceptanceCriteria — a checklist of specific, testable conditions.",
    // "Create one sub-ticket per focused work item. Each should be small enough for a single agent to complete.",
    ticket.acceptanceCriteria ? [
      "",
      "## Acceptance Criteria Verification",
      `Use the bonsai-cli tool to mark each criterion as done (0-indexed):`,
      `\`./bonsai-cli check-criteria ${ticket.id} 0\`  # checks off the first criterion`,
      `\`./bonsai-cli check-criteria ${ticket.id} 1\`  # checks off the second criterion`,
      "",
      "The acceptance criteria are:",
      ticket.acceptanceCriteria,
      "",
      "For each criterion: verify it is met, then check it off. If NOT met, report what's missing.",
    ].join("\n") : "",
  ].filter(Boolean).join("\n");
}

// ── QMD Search for prior work ────────────────────────
async function searchQMDForTicket(ticketId: number, role: string): Promise<string> {
  try {
    const { spawn } = await import("node:child_process");

    // Search QMD for artifacts related to this ticket
    const query = `ticket ${ticketId} ${role}`;

    return new Promise((resolve) => {
      let output = "";
      const proc = spawn("qmd", ["search", query, "-c", "bonsai-artifacts", "--limit", "3"], {
        stdio: ["ignore", "pipe", "ignore"],
      });

      proc.stdout.on("data", (data) => {
        output += data.toString();
      });

      proc.on("close", () => {
        // Return the search results or empty string if search failed
        resolve(output.trim() || "");
      });

      proc.on("error", () => {
        // QMD not installed or search failed - return empty
        resolve("");
      });

      // Timeout after 2 seconds
      setTimeout(() => {
        proc.kill();
        resolve("");
      }, 2000);
    });
  } catch {
    return "";
  }
}

// ── Agent task assembler ─────────────────────────────
async function assembleAgentTask(
  commentContent: string,
  ticket: typeof tickets.$inferSelect,
  persona: typeof personas.$inferSelect,
  opts?: { conversational?: boolean; mentioned?: boolean }
): Promise<string> {
  // ── Inbox ticket: project-level chat context ──────────
  if (ticket.title === "[Inbox]" && ticket.projectId) {
    const project = await getProjectById(ticket.projectId);
    const chatHistory = await getRecentProjectMessagesFormatted(ticket.projectId, 20);

    const sections: string[] = [
      `# Project Chat — ${project?.name || "Unknown"}`,
      "",
      "## Project Info",
      project?.description ? `Description: ${project.description}` : "",
      project?.techStack ? `Tech Stack: ${project.techStack}` : "",
      "",
      "## CONVERSATIONAL MODE",
      "You are responding in the project-wide chat. This is NOT a ticket — there is no specific ticket context.",
      "Reply conversationally — be direct and helpful. Keep responses concise (under 800 characters).",
      "You can reference the project's codebase, suggest improvements, answer questions, or coordinate with teammates.",
    ].filter(Boolean);

    if (chatHistory.length > 0) {
      sections.push("", "## Recent Chat History");
      sections.push(...chatHistory.map((c) => c + "\n---"));
    }

    sections.push(
      "",
      "## New Message (respond to this)",
      commentContent,
      "",
      `You are ${persona.name} (${persona.role}). Respond to the message above.`,
    );

    return sections.join("\n");
  }

  const { enrichedComments, researchDoc, implPlan, researchCritique, planCritique } = await getTicketContext(ticket.id);

  // QMD search for prior work on this ticket to prevent redundant effort
  const qmdContext = await searchQMDForTicket(ticket.id, persona.role || "developer");

  const sections: string[] = [
    `# Ticket: ${ticket.title}`,
    `ID: ${ticket.id} | State: ${ticket.state} | Type: ${ticket.type}`,
  ];

  if (ticket.description) {
    sections.push("", "## Description", ticket.description);
  }
  if (ticket.acceptanceCriteria) {
    sections.push("", "## Acceptance Criteria", ticket.acceptanceCriteria);
  }

  // Inject QMD search results to prevent redundant work
  if (qmdContext) {
    sections.push(
      "",
      "## PRIOR WORK ON THIS TICKET — READ THIS FIRST",
      "CRITICAL: Before starting any work, review what's already been done. The following artifacts have been found for this ticket:",
      "",
      qmdContext,
      "",
      "DO NOT repeat work that's already been completed. DO NOT re-research what's already been researched. If research exists, build on it. If a plan exists, implement it.",
      "Use `./bonsai-cli read-artifact ${ticket.id} research` or `./bonsai-cli read-artifact ${ticket.id} implementation_plan` to read the full artifacts if needed.",
      ""
    );
  }

  if (researchDoc) {
    // Critics need the full doc — only truncate for other roles
    const limit = persona.role === "critic" ? 12000 : 3000;
    const content = researchDoc.content.length > limit
      ? researchDoc.content.slice(0, limit) + "\n\n[...truncated]"
      : researchDoc.content;
    sections.push("", "## Research Document (v" + researchDoc.version + ")", content);
  }
  if (implPlan) {
    const limit = persona.role === "critic" ? 12000 : 3000;
    const content = implPlan.content.length > limit
      ? implPlan.content.slice(0, limit) + "\n\n[...truncated]"
      : implPlan.content;
    sections.push("", "## Implementation Plan (v" + implPlan.version + ")", content);
  }
  if (researchCritique) {
    sections.push("", "## Research Critique (v" + researchCritique.version + ")", researchCritique.content);
  }
  if (planCritique) {
    sections.push("", "## Plan Critique (v" + planCritique.version + ")", planCritique.content);
  }

  if (enrichedComments.length > 0) {
    sections.push("", "## Recent Comments");
    sections.push(...enrichedComments.map((c) => c + "\n---"));
  }

  // Determine current phase based on what's been approved
  const phase = ticket.state === "review" ? "review"
    : ticket.planApprovedAt ? "implementation"  // Plan approved = building phase
    : ticket.researchApprovedAt ? "planning"    // Research approved = planning phase
    : "research";                                // Nothing approved = research phase

  // Always inject phase context so the agent knows where we are
  if (phase === "implementation") {
    // BUILD phase — always inject this, even in conversational mode
    const prompt = await getSetting("prompt_phase_implementation");
    sections.push("", prompt || "## PHASE: IMPLEMENTATION — BUILD THE APP\nWrite code. Do NOT produce documents.");
    if (opts?.conversational) {
      sections.push("", "You were @mentioned. Answer briefly, but your PRIMARY job is to BUILD — write code, not documents. If the message is asking you to do work, DO the work (write code), don't just describe what you'd do.");
    }
  } else if (phase === "review") {
    // REVIEW phase — test thoroughly, even in conversational mode
    const prompt = await getSetting("prompt_phase_test");
    sections.push("", prompt || "## PHASE: REVIEW\nTest the app thoroughly. Run it, verify acceptance criteria, find bugs.");
    if (opts?.conversational) {
      sections.push("", "You were @mentioned. Answer briefly, but your PRIMARY job is to REVIEW — run the app, verify features work, find bugs.");
    }
  } else if (opts?.conversational) {
    // Conversational in research/planning — just reply
    const convPrompt = await getSetting("prompt_phase_conversational");
    sections.push("", convPrompt || "## CONVERSATIONAL MODE\nReply conversationally — short, direct, under 500 characters.");
  } else {
    // Phase-specific document instructions (research/planning only)
    if (phase === "planning" && persona.role === "developer") {
      const prompt = await getSetting("prompt_phase_planning");
      sections.push("", prompt || "## PHASE: PLANNING\nProduce the implementation plan as your response.");
    } else if (phase === "research" && persona.role === "researcher") {
      const prompt = await getSetting("prompt_phase_research");
      sections.push("", prompt || "## PHASE: RESEARCH\nProduce the research document as your response.");
    } else if (phase === "research" && persona.role === "critic") {
      const prompt = await getSetting("prompt_phase_research_critic");
      sections.push("", prompt || "## PHASE: RESEARCH — CRITIC REVIEW\nWrite your critical review.");
    }
  }

  // Designer always gets explicit tool-use instructions
  if (persona.role === "designer" && !opts?.conversational) {
    const toolPath = path.join(process.cwd(), "scripts", "tools", "nano-banana.mjs");
    const designerPrompt = (await getSetting("prompt_phase_designer") || "")
      .replace(/\{\{toolPath\}\}/g, toolPath)
      .replace(/\{\{ticketId\}\}/g, String(ticket.id))
      .replace(/\{\{personaId\}\}/g, persona.id);
    if (designerPrompt) {
      sections.push("", designerPrompt);
    }
  }

  sections.push(
    "",
    "## New Comment (respond to this)",
    commentContent,
  );

  if (persona.role === "designer") {
    const toolPath = path.join(process.cwd(), "scripts", "tools", "nano-banana.mjs");
    sections.push(
      "",
      `You are ${persona.name} (${persona.role}). Your FIRST action must be: Bash tool → node ${toolPath} "your prompt" --output designs/mockup.png --ticket ${ticket.id} --persona ${persona.id}`,
    );
  } else if (opts?.mentioned) {
    sections.push(
      "",
      `You are ${persona.name} (${persona.role}). You were @mentioned in the comment above. Read it and decide: if the message is directed at you or requires action from you, respond or do the work. If you are just being referenced and there is nothing for you to do, output a single empty line and move on — do NOT respond with filler like "nothing for me to do here."`,
    );
  } else {
    sections.push(
      "",
      `You are ${persona.name} (${persona.role}). Address the comment above.`,
    );
  }

  return sections.join("\n");
}

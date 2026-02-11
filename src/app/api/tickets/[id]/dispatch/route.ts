import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, personas, comments, projects, ticketDocuments, roles } from "@/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { getSetting, logAuditEvent } from "@/db/queries";

// ── Config ──────────────────────────────────────────
const HOME = process.env.HOME || "~";
const CLAUDE_CLI = path.join(HOME, ".local", "bin", "claude");
const MODEL = "opus";
const BONSAI_DIR = path.join(HOME, ".bonsai");
const API_BASE = "http://localhost:3000";

const TOOLS_READONLY = ["Read", "Grep", "Glob", "Bash"];
const TOOLS_FULL = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"];

// Agent skills directory — skills are discovered via --add-dir, not concatenated into prompts
const AGENTS_DIR = path.join(BONSAI_DIR, "agents");

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const PROJECTS_DIR = path.join(HOME, "development", "bonsai", "projects");

function resolveMainRepo(project: { githubRepo: string | null; slug: string; localPath: string | null }): string {
  if (project.localPath) return project.localPath;
  return path.join(PROJECTS_DIR, project.githubRepo || project.slug);
}

const WORKTREES_DIR = path.join(BONSAI_DIR, "worktrees");

function ensureWorktree(
  project: { githubRepo: string | null; slug: string; localPath: string | null },
  ticketId: string
): string {
  const mainRepo = resolveMainRepo(project);
  if (!fs.existsSync(mainRepo)) return mainRepo;

  const gitDir = path.join(mainRepo, ".git");
  if (!fs.existsSync(gitDir)) return mainRepo;

  const slug = project.slug || project.githubRepo || "unknown";
  const worktreePath = path.join(WORKTREES_DIR, slug, ticketId);
  const branchName = `ticket/${ticketId}`;

  if (fs.existsSync(worktreePath)) return worktreePath;

  fs.mkdirSync(path.join(WORKTREES_DIR, slug), { recursive: true });

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

// ── Agent Spawn (fire-and-forget, posts back when done) ──
function spawnAgent(
  sessionDir: string,
  cwd: string,
  tools: string[],
  ticketId: string,
  personaId: string,
  opts?: { conversational?: boolean; documentId?: number; role?: string }
) {
  const taskFile = path.join(sessionDir, "task.md");
  const outputFile = path.join(sessionDir, "output.md");
  const stderrFile = path.join(sessionDir, "stderr.log");
  const promptFile = path.join(sessionDir, "system-prompt.txt");
  const reportScript = path.join(sessionDir, "report.sh");

  // Write a helper script the agent can call to post progress updates
  fs.writeFileSync(reportScript, [
    `#!/usr/bin/env node`,
    `const msg = process.argv.slice(2).join(" ");`,
    `if (!msg) process.exit(0);`,
    `fetch("${API_BASE}/api/tickets/${ticketId}/report", {`,
    `  method: "POST",`,
    `  headers: { "Content-Type": "application/json" },`,
    `  body: JSON.stringify({ personaId: "${personaId}", content: msg }),`,
    `}).catch(() => {});`,
  ].join("\n"));
  fs.chmodSync(reportScript, 0o755);

  // Write check-criteria helper script
  const checkCriteriaScript = path.join(sessionDir, "check-criteria.sh");
  fs.writeFileSync(checkCriteriaScript, [
    `#!/usr/bin/env node`,
    `const idx = parseInt(process.argv[2], 10);`,
    `if (isNaN(idx)) { console.error("Usage: check-criteria.sh <index>"); process.exit(1); }`,
    `fetch("${API_BASE}/api/tickets/${ticketId}/check-criteria", {`,
    `  method: "POST",`,
    `  headers: { "Content-Type": "application/json" },`,
    `  body: JSON.stringify({ index: idx }),`,
    `}).then(r => r.json()).then(d => {`,
    `  if (d.ok) console.log("Checked criterion " + idx);`,
    `  else console.error("Failed:", d.error);`,
    `}).catch(e => console.error(e));`,
  ].join("\n"));
  fs.chmodSync(checkCriteriaScript, 0o755);

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
    env: { ...process.env, DISABLE_AUTOUPDATER: "1", GEMINI_API_KEY: process.env.GEMINI_API_KEY || "" },
  });
  child.unref();
}

// ── Helpers ──────────────────────────────────────────
function postAgentComment(ticketId: string, personaId: string, content: string) {
  db.insert(comments).values({ ticketId, authorType: "agent", personaId, content }).run();
  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (ticket) {
    db.update(tickets).set({ commentCount: (ticket.commentCount || 0) + 1 }).where(eq(tickets.id, ticketId)).run();
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function toolsForPhase(role: string, ticket: typeof tickets.$inferSelect): string[] {
  // Research and planning phases: ENFORCE read-only for ALL roles
  // Agents cannot write files — their stdout IS the document
  const phase = !ticket.researchApprovedAt ? "research"
    : !ticket.planApprovedAt ? "planning"
    : "implementation";

  if (phase === "research" || phase === "planning") {
    return TOOLS_READONLY;
  }

  // Implementation phase: use role-specific tools from DB
  const roleRow = db.select().from(roles).where(eq(roles.slug, role)).get();
  if (roleRow?.tools) {
    try { return JSON.parse(roleRow.tools); } catch {}
  }
  // Fallback to hardcoded defaults
  if (role === "researcher") return TOOLS_READONLY;
  if (role === "critic") return TOOLS_READONLY;
  if (role === "lead") return TOOLS_READONLY;
  return TOOLS_FULL;
}

// Determine which role should handle based on ticket state
function resolveTargetRole(ticket: typeof tickets.$inferSelect): string {
  // Research phase → always researcher
  if (!ticket.researchApprovedAt) return "researcher";
  // Planning phase → developer for code work, lead for everything else
  if (!ticket.planApprovedAt) {
    if (ticket.type === "feature" || ticket.type === "bug") return "developer";
    return "lead";
  }
  // Implementation → developer
  return "developer";
}

// ── Fetch ticket context ─────────────────────────────
function getTicketContext(ticketId: string) {
  const recentComments = db.select().from(comments)
    .where(eq(comments.ticketId, ticketId))
    .orderBy(desc(comments.createdAt))
    .limit(10)
    .all()
    .reverse();

  const enrichedComments = recentComments.map((c) => {
    let authorName = "Unknown";
    if (c.authorType === "agent" && c.personaId) {
      const p = db.select().from(personas).where(eq(personas.id, c.personaId)).get();
      if (p) authorName = `${p.name} (${p.role})`;
    } else {
      authorName = "Human";
    }
    return `**${authorName}** [${c.authorType}]:\n${c.content}`;
  });

  const docs = db.select().from(ticketDocuments)
    .where(eq(ticketDocuments.ticketId, ticketId))
    .orderBy(desc(ticketDocuments.version))
    .all();

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
  const { id: ticketId } = await params;
  const { commentContent, targetRole: requestedRole, targetPersonaName, targetPersonaId, team, silent, conversational, documentId } = await req.json();

  if (conversational) {
    console.log(`[dispatch] Conversational dispatch for ${ticketId}, documentId=${documentId}, targetPersonaId=${targetPersonaId}`);
  }

  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const project = ticket.projectId
    ? db.select().from(projects).where(eq(projects.id, ticket.projectId)).get()
    : null;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Get all non-deleted personas for this project
  const projectPersonas = db.select().from(personas)
    .where(and(
      eq(personas.projectId, project.id),
      isNull(personas.deletedAt)
    ))
    .all();

  // Handle @team dispatch — send to all project agents
  if (team && projectPersonas.length > 0) {
    const cwd = ensureWorktree(project, ticketId);
    if (!fs.existsSync(cwd)) {
      fs.mkdirSync(cwd, { recursive: true });
      console.warn(`[dispatch] Created missing workspace: ${cwd}`);
    }

    const dispatched: Array<{ id: string; name: string; role: string | null; color: string | null; avatarUrl: string | null }> = [];

    for (const persona of projectPersonas) {
      const sessionDir = path.join(BONSAI_DIR, "sessions", `${ticketId}-agent-${Date.now()}-${persona.id}`);
      fs.mkdirSync(sessionDir, { recursive: true });

      fs.writeFileSync(
        path.join(sessionDir, "system-prompt.txt"),
        buildAgentSystemPrompt(persona, project, ticket, sessionDir, projectPersonas)
      );
      fs.writeFileSync(
        path.join(sessionDir, "task.md"),
        assembleAgentTask(commentContent, ticket, persona, { conversational })
      );

      spawnAgent(sessionDir, cwd, toolsForRole(persona.role || "developer"), ticketId, persona.id, { conversational, documentId, role: persona.role || "developer" });

      dispatched.push({
        id: persona.id,
        name: persona.name,
        role: persona.role,
        color: persona.color,
        avatarUrl: persona.avatar,
      });

      logAuditEvent({
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
      postAgentComment(ticketId, dispatched[0].id, `👥 Team dispatch: ${teamNames} are looking into this.`);
    }

    // Update last activity (use first persona as assignee for tracking)
    db.update(tickets)
      .set({ lastAgentActivity: new Date().toISOString(), assigneeId: dispatched[0].id })
      .where(eq(tickets.id, ticketId))
      .run();

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
  if (!targetPersona && targetPersonaName) {
    const allPersonas = db.select().from(personas).where(isNull(personas.deletedAt)).all();
    const globalMatch = allPersonas.find((p) => p.name.toLowerCase() === targetPersonaName.toLowerCase());
    if (globalMatch) {
      console.warn(`[dispatch] @${targetPersonaName} not in project ${project.id} personas (${projectPersonas.map(p => p.name).join(", ")}). Found globally as ${globalMatch.id} (project ${globalMatch.projectId}).`);
      targetPersona = globalMatch;
    } else {
      console.warn(`[dispatch] @${targetPersonaName} not found anywhere. Falling back to role-based routing.`);
    }
  }

  if (!targetPersona) {
    const targetRole = requestedRole || resolveTargetRole(ticket);
    console.log(`[dispatch] Role-based routing: ${targetRole} for ticket ${ticketId} (project personas: ${projectPersonas.map(p => `${p.name}/${p.role}`).join(", ")})`);
    targetPersona = projectPersonas.find((p) => p.role === targetRole)
      || projectPersonas.find((p) => p.role === "developer")
      || projectPersonas.find((p) => p.role !== "lead")
      || projectPersonas[0];
  }

  if (!targetPersona) {
    return NextResponse.json({ error: "No personas available" }, { status: 400 });
  }

  const cwd = ensureWorktree(project, ticketId);

  // Ensure workspace exists — create if missing so agent doesn't silently fail
  if (!fs.existsSync(cwd)) {
    fs.mkdirSync(cwd, { recursive: true });
    console.warn(`[dispatch] Created missing workspace: ${cwd}`);
  }

  // Create agent session
  const sessionDir = path.join(BONSAI_DIR, "sessions", `${ticketId}-agent-${Date.now()}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  fs.writeFileSync(
    path.join(sessionDir, "system-prompt.txt"),
    buildAgentSystemPrompt(targetPersona, project, ticket, sessionDir, projectPersonas)
  );
  fs.writeFileSync(
    path.join(sessionDir, "task.md"),
    assembleAgentTask(commentContent, ticket, targetPersona, { conversational })
  );

  // Spawn the agent (fire-and-forget, posts comment when done)
  spawnAgent(sessionDir, cwd, toolsForRole(targetPersona.role || "developer"), ticketId, targetPersona.id, { conversational, documentId, role: targetPersona.role || "developer" });

  // Post a brief "working on it" comment (skip for silent/auto dispatches)
  const ackMsg = `Looking into this now.`;
  if (!silent) {
    postAgentComment(ticketId, targetPersona.id, ackMsg);
  }

  logAuditEvent({
    ticketId,
    event: "agent_dispatched",
    actorType: "system",
    actorName: "System",
    detail: `Dispatched ${targetPersona.name} (${targetPersona.role})`,
    metadata: { personaId: targetPersona.id, role: targetPersona.role },
  });

  // Set last_agent_activity to prevent heartbeat overlap
  db.update(tickets)
    .set({ lastAgentActivity: new Date().toISOString(), assigneeId: targetPersona.id })
    .where(eq(tickets.id, ticketId))
    .run();

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
function buildAgentSystemPrompt(
  persona: typeof personas.$inferSelect,
  project: typeof projects.$inferSelect,
  ticket: typeof tickets.$inferSelect,
  sessionDir: string,
  teamMembers: (typeof personas.$inferSelect)[] = []
): string {
  const workspace = ensureWorktree(project, ticket.id);
  const reportScript = path.join(sessionDir, "report.sh");

  // Role instructions: read from roles table (editable in Settings > Roles)
  const role = persona.role || "developer";
  const roleRow = db.select().from(roles).where(eq(roles.slug, role)).get();
  const roleInstructions = roleRow?.systemPrompt
    || getSetting(`prompt_role_${role}`)
    || `You are a ${role}. Follow your role's responsibilities for this project.`;

  // Tool/capability mappings by role
  const roleCapabilities: Record<string, string[]> = {
    researcher: [
      "Read, Grep, Glob (read-only file access)",
      "Bash (read-only commands)",
      "report.sh (post progress updates)",
    ],
    developer: [
      "Read, Write, Edit, Grep, Glob (full file access)",
      "Bash (full command access)",
      "Git (status, diff, commit, push)",
      "report.sh (post progress updates)",
      "apply_transparency (remove grey backgrounds from images)",
    ],
    designer: [
      "Read, Write, Edit, Grep, Glob (full file access)",
      "Bash (full command access)",
      "nano_banana (AI image generation via Gemini)",
      "apply_transparency (remove grey backgrounds from images)",
      "report.sh (post progress updates)",
    ],
    hacker: [
      "Read, Write, Edit, Grep, Glob (full file access)",
      "Bash (full command access)",
      "Git (status, diff, commit, push)",
      "report.sh (post progress updates)",
      "apply_transparency (remove grey backgrounds from images)",
    ],
    critic: [
      "Read, Grep, Glob (read-only file access)",
      "Bash (read-only commands)",
      "report.sh (post progress updates)",
    ],
    lead: [
      "Read, Grep, Glob (read-only file access)",
      "Bash (read-only commands)",
      "report.sh (post progress updates)",
    ],
  };

  const capabilities = roleCapabilities[role] || roleCapabilities.developer;

  const timestamp = new Date().toISOString();

  return [
    `You are ${persona.name}, working on project "${project.name}".`,
    `Workspace: ${workspace}`,
    `Session started: ${timestamp}`,
    "",
    "CRITICAL WORKSPACE RULES:",
    `- Your workspace is: ${workspace}`,
    "- ONLY read and modify files inside this directory.",
    "- Do NOT navigate to parent directories. Do NOT use ../",
    "- If your workspace is empty or has only a README, that is NORMAL — this is a new/greenfield project.",
    "- You are managed by Bonsai (a separate ticketing/orchestration system). Bonsai's source code exists in a parent directory. IGNORE IT. It is NOT your project.",
    "- If you find files like src/db/schema.ts, src/app/api/*, or package.json with 'next'/'drizzle' — that is Bonsai, NOT your project. Stop and re-orient.",
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
    `You MUST report progress to the ticket thread as you work using: \`${reportScript} "your message"\``,
    "Post a report when you:",
    "- **Start investigating** a new area (e.g. \"Examining auth middleware in src/middleware.ts\")",
    "- **Find something significant** (e.g. \"Found that session tokens are stored in localStorage, not httpOnly cookies\")",
    "- **Complete a major step** (e.g. \"Finished analyzing the database schema — 3 tables involved\")",
    "- **Make a decision** (e.g. \"Going with approach B: adding a new API route instead of modifying the existing one\")",
    "- **Hit a blocker or uncertainty** (e.g. \"Not sure if we need to handle the legacy format — flagging for review\")",
    "Keep reports short (1-3 sentences). They form the audit trail of your work.",
    ticket.acceptanceCriteria ? [
      "",
      "## Acceptance Criteria Verification",
      `Use the check-criteria tool to mark each criterion as done (0-indexed):`,
      `\`${path.join(sessionDir, "check-criteria.sh")} 0\`  # checks off the first criterion`,
      `\`${path.join(sessionDir, "check-criteria.sh")} 1\`  # checks off the second criterion`,
      "",
      "The acceptance criteria are:",
      ticket.acceptanceCriteria,
      "",
      "For each criterion: verify it is met, then check it off. If NOT met, report what's missing.",
    ].join("\n") : "",
  ].filter(Boolean).join("\n");
}

// ── Agent task assembler ─────────────────────────────
function assembleAgentTask(
  commentContent: string,
  ticket: typeof tickets.$inferSelect,
  persona: typeof personas.$inferSelect,
  opts?: { conversational?: boolean }
): string {
  const { enrichedComments, researchDoc, implPlan, researchCritique, planCritique } = getTicketContext(ticket.id);

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

  // Phase-specific instructions (skip when conversational — agent should reply, not produce a document)
  if (!opts?.conversational) {
    const phase = !ticket.researchApprovedAt ? "research"
      : !ticket.planApprovedAt ? "planning"
      : "implementation";

    if (phase === "planning" && (persona.role === "developer" || persona.role === "lead")) {
      sections.push(
        "",
        "## PHASE: PLANNING",
        "You are producing the IMPLEMENTATION PLAN. Your entire stdout will be saved as the plan document.",
        "CRITICAL: Do NOT write the plan to a file. Do NOT create docs/IMPLEMENTATION-PLAN.md or any other file. Your stdout IS the document — the system captures it automatically and versions it. Writing to a file means your work is LOST.",
        "Do NOT ask questions. Be decisive — make assumptions and document them.",
        "If previous comments contain answers to earlier questions, incorporate them into a COMPLETE revised plan.",
      );
    } else if (phase === "research" && persona.role === "researcher") {
      sections.push(
        "",
        "## PHASE: RESEARCH",
        "You are producing the RESEARCH DOCUMENT. Your entire stdout will be saved as the research document.",
        "CRITICAL: Do NOT write the document to a file. Do NOT create docs/RESEARCH.md or any other file. Your stdout IS the document — the system captures it automatically and versions it. Writing to a file means your work is LOST.",
      );
    } else if (phase === "implementation" && (persona.role === "developer" || persona.role === "lead")) {
      sections.push(
        "",
        "## PHASE: IMPLEMENTATION",
        "The research and implementation plan have BOTH been approved. You are now BUILDING.",
        "Follow the implementation plan above step by step. Write real code — create files, install dependencies, build the feature.",
        "Work inside your workspace directory ONLY. Do not modify files outside it.",
        "After completing each major step, report progress using the report script.",
      );
    }

    // Designer always gets explicit tool-use instructions
    if (persona.role === "designer") {
      const toolPath = path.join(process.cwd(), "scripts", "tools", "nano-banana.mjs");
      sections.push(
        "",
        "## ACTION REQUIRED: GENERATE IMAGES WITH NANO-BANANA",
        `Your FIRST action MUST be a Bash tool call to generate an image. Run this exact command (fill in the prompt):`,
        "",
        `node ${toolPath} "DESCRIBE THE UI HERE IN DETAIL" --output designs/mockup.png --ticket ${ticket.id} --persona ${persona.id}`,
        "",
        "This will generate an image via Gemini AI, save it to designs/, and attach it to the ticket.",
        "Do NOT write text describing designs. Do NOT skip this step. Do NOT pretend you ran it.",
        "If the command fails, paste the error. Do not fabricate output.",
      );
    }
  } else {
    sections.push(
      "",
      "## CONVERSATIONAL MODE",
      "A human left a comment on a document. Reply CONVERSATIONALLY — short, direct, under 500 characters.",
      "Do NOT produce a full document. Do NOT output headers or structured markdown.",
      "Just answer their question or acknowledge their feedback like a teammate would in a chat.",
    );
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
  } else {
    sections.push(
      "",
      `You are ${persona.name} (${persona.role}). Address the comment above.`,
    );
  }

  return sections.join("\n");
}

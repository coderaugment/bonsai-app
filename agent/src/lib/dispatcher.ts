/**
 * dispatcher.ts — Three-phase ticket lifecycle automation
 *
 * Extracted from webapp/scripts/heartbeat-dispatch.ts to enable
 * CLI invocation and testing.
 *
 * Phases:
 *   1. RESEARCH — backlog tickets without research → researcher agent
 *   2. PLANNING — research-approved tickets without plan → planner agent
 *   3. IMPLEMENTATION — plan-approved tickets → developer agent
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { config as dotenvConfig } from "dotenv";
import { researcherRole } from "../roles/researcher.js";
import { plannerRole } from "../roles/planner.js";
import { developerRole } from "../roles/developer.js";
import { criticRole } from "../roles/critic.js";

// Load .env files from webapp directory (where credentials are stored)
const webappEnvPath = path.join(process.env.HOME || "", "development", "bonsai", "webapp", ".env");
if (fs.existsSync(webappEnvPath)) {
  dotenvConfig({ path: webappEnvPath });
}
// Also try .env.local if it exists
const webappEnvLocalPath = path.join(process.env.HOME || "", "development", "bonsai", "webapp", ".env.local");
if (fs.existsSync(webappEnvLocalPath)) {
  dotenvConfig({ path: webappEnvLocalPath, override: true });
}

const execAsync = promisify(exec);

// ── Configuration ───────────────────────────────
export const AGENT_ACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const AGENT_MAX_DURATION_MS = 5 * 60 * 1000; // 5 min for research/planning
export const DEVELOPER_MAX_DURATION_MS = 10 * 60 * 1000; // 10 min for implementation
export const MAX_CONCURRENT = 2; // max agent runs at the same time

// ── Types ───────────────────────────────────────
interface TicketRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  state: string;
  project_id: number;
  assignee_id: string | null;
  last_agent_activity: string | null;
  research_completed_at: string | null;
  research_approved_at: string | null;
  plan_completed_at: string | null;
  plan_approved_at: string | null;
  acceptance_criteria: string | null;
  last_human_comment_at: string | null;
  returned_from_verification: number;
}

interface PersonaRow {
  id: string;
  name: string;
  role: string;
  personality: string | null;
  skills: string | null;
  project_id: number;
  role_id: number | null;
}

interface RoleRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  system_prompt: string | null;
  workflow: string | null;
  tools: string | null;
  skill_definitions: string | null;
}

interface ProjectRow {
  id: number;
  name: string;
  slug: string;
  github_owner: string | null;
  github_repo: string | null;
}

interface DocRow {
  content: string;
}

export interface DispatchOptions {
  limit: number;
  env: "dev" | "prod";
}

export interface DispatchResult {
  dispatched: number;
  completed: number;
  skipped: number;
  errors: string[];
}

// ── Logging ─────────────────────────────────────
let LOG_FILE: string;

function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `[${ts}] [dispatch] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // log dir might not exist
  }
}

// ── Workspace resolution ────────────────────────
function resolveMainRepo(project: ProjectRow): string {
  const home = process.env.HOME || "~";
  if (project.github_repo === "bonsai-app") {
    return path.join(home, "development", "bonsai", "webapp");
  }
  if (project.github_repo === "bonsai-agent") {
    return path.join(home, "development", "bonsai", "agent");
  }
  return path.join(home, "development", project.github_repo || project.slug);
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function ensureWorktree(
  project: ProjectRow,
  ticketId: string,
  WORKTREES_DIR: string
): string | null {
  const mainRepo = resolveMainRepo(project);
  if (!fs.existsSync(mainRepo)) {
    log(`  ERROR: main repo not found at ${mainRepo}`);
    return null;
  }

  // Check if main repo is a git repo
  const gitDir = path.join(mainRepo, ".git");
  if (!fs.existsSync(gitDir)) {
    log(`  WARN: ${mainRepo} is not a git repo, using directly`);
    return mainRepo;
  }

  const slug = project.slug || project.github_repo || "unknown";
  const worktreePath = path.join(WORKTREES_DIR, slug, ticketId);
  const branchName = `ticket/${ticketId}`;

  // If worktree already exists, reuse it
  if (fs.existsSync(worktreePath)) {
    log(`  [${ticketId}] reusing worktree at ${worktreePath}`);
    return worktreePath;
  }

  fs.mkdirSync(path.join(WORKTREES_DIR, slug), { recursive: true });

  try {
    const { execSync } = require("node:child_process");
    const opts = {
      cwd: mainRepo,
      encoding: "utf-8" as const,
      stdio: ["pipe", "pipe", "pipe"] as const,
    };

    // Check if branch already exists
    try {
      execSync(`git rev-parse --verify ${branchName}`, opts);
      log(`  [${ticketId}] branch ${branchName} exists`);
    } catch {
      // Branch doesn't exist — create from current HEAD
      execSync(`git branch ${branchName}`, opts);
      log(`  [${ticketId}] created branch ${branchName}`);
    }

    // Create worktree
    execSync(
      `git worktree add ${shellEscape(worktreePath)} ${branchName}`,
      opts
    );
    log(`  [${ticketId}] created worktree at ${worktreePath}`);

    // Copy env files from main repo so builds have DB credentials, API keys, etc.
    for (const envFile of [".env", ".env.local", ".env.development", ".env.development.local"]) {
      const src = path.join(mainRepo, envFile);
      const dst = path.join(worktreePath, envFile);
      if (fs.existsSync(src) && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
        log(`  [${ticketId}] copied ${envFile} to worktree`);
      }
    }

    return worktreePath;
  } catch (err: any) {
    const msg = err.stderr?.toString() || err.message || String(err);
    log(
      `  [${ticketId}] ERROR creating worktree: ${msg.trim().slice(0, 200)}`
    );
    // Fall back to main repo
    return mainRepo;
  }
}

// ── Claude CLI ──────────────────────────────────
const CLAUDE_CLI = path.join(process.env.HOME || "", ".local", "bin", "claude");
const MODEL = "sonnet";

const TOOLS_READONLY = ["Read", "Grep", "Glob", "Bash(git:*)"];
const TOOLS_FULL = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"];

async function runClaude(
  sessionDir: string,
  systemPrompt: string,
  cwd: string,
  timeoutMs: number,
  tools: string[] = TOOLS_READONLY
): Promise<{
  stdout: string;
  stderr: string;
  code: number;
  timedOut: boolean;
}> {
  const taskFile = path.join(sessionDir, "task.md");
  const outputFile = path.join(sessionDir, "output.md");
  const stderrFile = path.join(sessionDir, "stderr.log");
  const promptFile = path.join(sessionDir, "system-prompt.txt");

  // NOTE: Using exec() here (not execFile) because we need shell features for piping.
  // Input is sanitized via shellEscape() - no user input flows directly into the command.
  const cmd = [
    `cat ${shellEscape(taskFile)} |`,
    `${shellEscape(CLAUDE_CLI)}`,
    `-p`,
    `--model ${MODEL}`,
    `--allowedTools "${tools.join(",")}"`,
    `--output-format text`,
    `--no-session-persistence`,
    `--append-system-prompt "$(cat ${shellEscape(promptFile)})"`,
    `> ${shellEscape(outputFile)} 2> ${shellEscape(stderrFile)}`,
  ].join(" ");

  log(`  shell command: claude -p ... > output.md 2> stderr.log`);

  try {
    await execAsync(cmd, {
      cwd,
      env: { ...process.env, DISABLE_AUTOUPDATER: "1" },
      timeout: timeoutMs,
      maxBuffer: 1024,
      killSignal: "SIGTERM",
    });

    const stdout = fs.existsSync(outputFile)
      ? fs.readFileSync(outputFile, "utf-8")
      : "";
    const stderr = fs.existsSync(stderrFile)
      ? fs.readFileSync(stderrFile, "utf-8")
      : "";
    return { stdout, stderr, code: 0, timedOut: false };
  } catch (err: any) {
    const stdout = fs.existsSync(outputFile)
      ? fs.readFileSync(outputFile, "utf-8")
      : "";
    const stderr = fs.existsSync(stderrFile)
      ? fs.readFileSync(stderrFile, "utf-8")
      : "";
    const timedOut = err.killed === true;
    return { stdout, stderr, code: err.code ?? 1, timedOut };
  }
}

// ── Build system prompts ────────────────────────
// These functions would ideally import from webapp, but for now we'll inline simplified versions
function buildSystemPrompt(
  persona: PersonaRow,
  project: ProjectRow,
  ticket: TicketRow,
  workspace: string
): string {
  return `You are ${persona.name}, working on ticket ${ticket.id} for project ${project.name}.\nWorkspace: ${workspace}`;
}

function buildResearchPrompt(
  persona: PersonaRow,
  project: ProjectRow,
  ticket: TicketRow,
  workspacePath: string
): string {
  const basePrompt = buildSystemPrompt(persona, project, ticket, workspacePath);

  return [
    basePrompt,
    `\n## Research Guidelines\n${researcherRole.systemPrompt}`,
    researcherRole.workflow?.outputFormat
      ? `\n## Required Output Format\n${researcherRole.workflow.outputFormat}`
      : "",
  ].join("\n");
}

function buildCriticPrompt(
  persona: PersonaRow,
  project: ProjectRow,
  ticket: TicketRow,
  workspacePath: string
): string {
  const basePrompt = buildSystemPrompt(persona, project, ticket, workspacePath);

  return [
    basePrompt,
    `\n## Critic Guidelines\n${criticRole.systemPrompt}`,
    criticRole.workflow?.outputFormat
      ? `\n## Required Output Format\n${criticRole.workflow.outputFormat}`
      : "",
  ].join("\n");
}

function buildPlannerPrompt(
  persona: PersonaRow,
  project: ProjectRow,
  ticket: TicketRow,
  workspacePath: string
): string {
  const basePrompt = buildSystemPrompt(persona, project, ticket, workspacePath);

  return [
    basePrompt,
    `\n## Planning Guidelines\n${plannerRole.systemPrompt}`,
    plannerRole.workflow?.outputFormat
      ? `\n## Required Output Format\n${plannerRole.workflow.outputFormat}`
      : "",
  ].join("\n");
}

function buildDeveloperPrompt(
  persona: PersonaRow,
  project: ProjectRow,
  ticket: TicketRow,
  workspacePath: string
): string {
  const basePrompt = buildSystemPrompt(persona, project, ticket, workspacePath);

  return [
    basePrompt,
    `\n## Development Guidelines\n${developerRole.systemPrompt}`,
    developerRole.workflow?.outputFormat
      ? `\n## Required Output Format\n${developerRole.workflow.outputFormat}`
      : "",
  ].join("\n");
}

// ── Run an agent phase ──────────────────────────
async function runAgentPhase(
  ticket: TicketRow,
  persona: PersonaRow,
  project: ProjectRow,
  phase: string,
  systemPrompt: string,
  taskContent: string,
  tools: string[],
  timeoutMs: number,
  BONSAI_DIR: string,
  WORKTREES_DIR: string
): Promise<string | null> {
  const workspacePath = ensureWorktree(project, ticket.id, WORKTREES_DIR);

  if (!workspacePath) {
    return null;
  }

  const sessionDir = path.join(BONSAI_DIR, "sessions", `${ticket.id}-${phase}`);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, "system-prompt.txt"), systemPrompt);
  fs.writeFileSync(path.join(sessionDir, "task.md"), taskContent);

  log(`  [${ticket.id}] running ${phase} in ${workspacePath}`);

  try {
    const result = await runClaude(
      sessionDir,
      systemPrompt,
      workspacePath,
      timeoutMs,
      tools
    );

    fs.appendFileSync(
      path.join(sessionDir, "session.jsonl"),
      JSON.stringify({
        event: result.timedOut ? "timeout" : "complete",
        exitCode: result.code,
        outputLength: result.stdout.length,
        stderrLength: result.stderr.length,
      }) + "\n"
    );

    log(
      `  [${ticket.id}] ${phase} finished: code=${result.code}, output=${result.stdout.length} chars, timedOut=${result.timedOut}`
    );

    const content = result.stdout.trim();
    if (!result.timedOut && result.code === 0 && content.length > 100) {
      return content;
    }

    if (result.timedOut) {
      log(`  [${ticket.id}] timed out after ${timeoutMs / 1000}s`);
    } else if (content.length < 100) {
      log(`  [${ticket.id}] WARNING: output too short (${content.length} chars)`);
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  [${ticket.id}] ERROR: ${msg.slice(0, 200)}`);
    return null;
  }
}

// ── Dispatch helpers ────────────────────────────
function isAgentActiveOnTicket(ticket: TicketRow): boolean {
  if (!ticket.last_agent_activity) return false;
  const lastActivity = new Date(ticket.last_agent_activity).getTime();
  const now = Date.now();
  return now - lastActivity < AGENT_ACTIVITY_TIMEOUT_MS;
}

interface RoundRobinResult {
  dispatched: number;
  completed: number;
  skipped: number;
}

// Round-robin dispatch across projects
async function roundRobinDispatch(
  db: Database.Database,
  tickets: TicketRow[],
  personaRole: string,
  maxTickets: number,
  BONSAI_DIR: string,
  WORKTREES_DIR: string,
  runFn: (
    ticket: TicketRow,
    persona: PersonaRow,
    project: ProjectRow
  ) => Promise<boolean>
): Promise<RoundRobinResult> {
  const findPersonaForProject = db.prepare(`
    SELECT id, name, role, personality, skills, project_id, role_id
    FROM personas
    WHERE role = ?
      AND project_id = ?
    LIMIT 1
  `);

  const getProject = db.prepare(`
    SELECT id, name, slug, github_owner, github_repo
    FROM projects WHERE id = ?
  `);

  const markAgentActivity = db.prepare(`
    UPDATE tickets
    SET last_agent_activity = ?,
        assignee_id = ?
    WHERE id = ?
  `);

  const byProject = new Map<
    number,
    { tickets: TicketRow[]; persona: PersonaRow; project: ProjectRow }
  >();

  for (const t of tickets) {
    if (!byProject.has(t.project_id)) {
      const persona = findPersonaForProject.get(
        personaRole,
        t.project_id
      ) as PersonaRow | undefined;
      const project = getProject.get(t.project_id) as ProjectRow | undefined;
      if (!persona) {
        log(`  WARN: no ${personaRole} persona for project ${t.project_id} — skipping`);
        continue;
      }
      if (!project) {
        log(`  WARN: project ${t.project_id} not found — skipping`);
        continue;
      }
      byProject.set(t.project_id, { tickets: [], persona, project });
    }
    byProject.get(t.project_id)!.tickets.push(t);
  }

  let dispatched = 0;
  let skipped = 0;
  let completed = 0;

  const queues = [...byProject.values()].map((p) => ({ ...p, index: 0 }));

  // Collect all dispatchable jobs via round-robin, then run in batches of MAX_CONCURRENT
  type Job = { ticket: TicketRow; persona: PersonaRow; project: ProjectRow };
  const jobs: Job[] = [];

  let remaining = true;
  while (remaining && jobs.length < maxTickets) {
    remaining = false;
    for (const queue of queues) {
      if (jobs.length >= maxTickets) break;

      while (queue.index < queue.tickets.length) {
        const ticket = queue.tickets[queue.index];
        queue.index++;

        // TypeScript doesn't know that array bounds are checked, so assert non-null
        if (!ticket) continue;

        if (isAgentActiveOnTicket(ticket)) {
          log(`  SKIP: ${ticket.id} "${ticket.title}" — agent active`);
          skipped++;
          continue;
        }

        remaining = true;
        jobs.push({ ticket, persona: queue.persona, project: queue.project });
        break; // Round-robin: move to next project
      }
    }
  }

  // Run jobs in batches of MAX_CONCURRENT
  for (let i = 0; i < jobs.length; i += MAX_CONCURRENT) {
    const batch = jobs.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(({ ticket, persona, project }) => {
      log(
        `  DISPATCH: ${ticket.id} "${ticket.title}" → ${persona.name} (${persona.id})`
      );
      markAgentActivity.run(new Date().toISOString(), persona.id, ticket.id);
      dispatched++;

      return runFn(ticket, persona, project).then((success) => {
        if (success) {
          completed++;
        } else {
          markAgentActivity.run(null, null, ticket.id);
        }
      });
    });
    await Promise.all(promises);
  }

  return { dispatched, completed, skipped };
}

// ── Phase 1: Research (versioned: v1→researcher, v2→critic, v3→researcher) ──
interface TicketRowWithVersion extends TicketRow {
  max_research_version: number;
}

async function dispatchResearch(
  db: Database.Database,
  maxTickets: number,
  BONSAI_DIR: string,
  WORKTREES_DIR: string
): Promise<RoundRobinResult> {
  log("=== Phase 1: RESEARCH (versioned) ===");

  // Find backlog tickets where research isn't complete (fewer than 3 versions)
  const findTicketsNeedingResearch = db.prepare(`
    SELECT t.id, t.title, t.description, t.type, t.state, t.project_id, t.assignee_id,
           t.last_agent_activity, t.research_completed_at, t.acceptance_criteria,
           t.last_human_comment_at, t.returned_from_verification,
           t.research_approved_at, t.plan_completed_at, t.plan_approved_at,
           COALESCE(MAX(td.version), 0) AS max_research_version
    FROM tickets t
    LEFT JOIN ticket_documents td ON td.ticket_id = t.id AND td.type = 'research'
    WHERE t.state = 'backlog'
      AND t.research_completed_at IS NULL
    GROUP BY t.id
    HAVING max_research_version < 3
    ORDER BY t.priority DESC, t.created_at ASC
  `);

  const tickets = findTicketsNeedingResearch.all() as TicketRowWithVersion[];

  if (tickets.length === 0) {
    log("  no tickets need research");
    return { dispatched: 0, completed: 0, skipped: 0 };
  }

  log(`  found ${tickets.length} ticket(s) needing research work`);

  const insertDocument = db.prepare(`
    INSERT INTO ticket_documents (ticket_id, type, content, version, author_persona_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const markResearchCompleted = db.prepare(`
    UPDATE tickets
    SET research_completed_at = ?,
        research_completed_by = ?
    WHERE id = ?
  `);

  const getDocumentContent = db.prepare(`
    SELECT content FROM ticket_documents
    WHERE ticket_id = ? AND type = 'research'
    ORDER BY version DESC LIMIT 1
  `);

  const insertComment = db.prepare(`
    INSERT INTO comments (ticket_id, author_type, persona_id, content)
    VALUES (?, 'agent', ?, ?)
  `);

  const bumpCommentCount = db.prepare(`
    UPDATE tickets SET comment_count = comment_count + 1 WHERE id = ?
  `);

  function postAgentComment(
    ticketId: string,
    personaId: string,
    content: string
  ) {
    insertComment.run(ticketId, personaId, content);
    bumpCommentCount.run(ticketId);
  }

  // Determine role based on version: v1 & v3 → researcher, v2 → critic
  const versionToRole = (maxVersion: number): string => {
    if (maxVersion === 1) return "critic";  // v1 done, need critic for v2
    return "researcher";                     // v0→v1 or v2→v3
  };

  // Build a map so runFn can look up version for each ticket
  const ticketVersionMap = new Map<string, number>();
  for (const t of tickets) {
    ticketVersionMap.set(t.id, t.max_research_version);
  }

  // Group tickets by required role for round-robin dispatch
  const researcherTickets = tickets.filter(t => versionToRole(t.max_research_version) === "researcher");
  const criticTickets = tickets.filter(t => versionToRole(t.max_research_version) === "critic");

  let totalResult: RoundRobinResult = { dispatched: 0, completed: 0, skipped: 0 };

  // Dispatch researcher tickets (v1 and v3)
  if (researcherTickets.length > 0) {
    log(`  ${researcherTickets.length} ticket(s) need researcher (v1/v3)`);
    const r = await roundRobinDispatch(
      db,
      researcherTickets,
      "researcher",
      maxTickets,
      BONSAI_DIR,
      WORKTREES_DIR,
      async (ticket, persona, project) => {
        const maxVersion = ticketVersionMap.get(ticket.id) || 0;
        const nextVersion = maxVersion + 1;
        const workspacePath = resolveMainRepo(project);

        let systemPrompt: string;
        let task: string;

        if (nextVersion === 1) {
          // v1: initial research
          systemPrompt = buildResearchPrompt(persona, project, ticket, workspacePath);
          task = [
            `# Research Ticket: ${ticket.id}`,
            `## ${ticket.title}`,
            ticket.description ? `\n### Description\n${ticket.description}` : "",
            ticket.acceptance_criteria
              ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}`
              : "",
            `\nResearch this ticket thoroughly. Explore the codebase, understand the current state, identify constraints and edge cases. Output your complete research document in markdown format.`,
          ].join("\n");
        } else {
          // v3: final revision incorporating critic's feedback
          const v2Doc = getDocumentContent.get(ticket.id) as DocRow | undefined;
          const v2Content = v2Doc?.content || "(No critic review found)";
          systemPrompt = buildResearchPrompt(persona, project, ticket, workspacePath);
          task = [
            `# Final Research Revision: ${ticket.id}`,
            `## ${ticket.title}`,
            ticket.description ? `\n### Description\n${ticket.description}` : "",
            ticket.acceptance_criteria
              ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}`
              : "",
            `\n---\n\n## Critic's Review (v2)\n\n${v2Content}`,
            `\n---\n\nThe critic has reviewed your research and produced v2 above. Read their critique notes carefully, address their corrections and gaps, and produce the final v3 research document. Preserve what's strong, fix what was wrong, and fill gaps they identified.`,
          ].join("\n");
        }

        const doc = await runAgentPhase(
          ticket,
          persona,
          project,
          `research-v${nextVersion}`,
          systemPrompt,
          task,
          TOOLS_READONLY,
          AGENT_MAX_DURATION_MS,
          BONSAI_DIR,
          WORKTREES_DIR
        );
        if (doc) {
          insertDocument.run(ticket.id, "research", doc, nextVersion, persona.id);
          if (nextVersion >= 3) {
            markResearchCompleted.run(new Date().toISOString(), persona.id, ticket.id);
            postAgentComment(ticket.id, persona.id,
              `Final research (v3) complete (${doc.length} chars). Ready for human review.`);
          } else {
            postAgentComment(ticket.id, persona.id,
              `Initial research (v1) complete (${doc.length} chars). Awaiting critic review.`);
          }
          log(`  COMPLETE: ${ticket.id} — research v${nextVersion} stored (${doc.length} chars)`);
          return true;
        }
        return false;
      }
    );
    totalResult.dispatched += r.dispatched;
    totalResult.completed += r.completed;
    totalResult.skipped += r.skipped;
  }

  // Dispatch critic tickets (v2)
  if (criticTickets.length > 0) {
    log(`  ${criticTickets.length} ticket(s) need critic review (v2)`);
    const r = await roundRobinDispatch(
      db,
      criticTickets,
      "critic",
      maxTickets,
      BONSAI_DIR,
      WORKTREES_DIR,
      async (ticket, persona, project) => {
        const v1Doc = getDocumentContent.get(ticket.id) as DocRow | undefined;
        const v1Content = v1Doc?.content || "(No research document found)";
        const workspacePath = resolveMainRepo(project);
        const systemPrompt = buildCriticPrompt(persona, project, ticket, workspacePath);
        const task = [
          `# Critic Review: ${ticket.id}`,
          `## ${ticket.title}`,
          ticket.description ? `\n### Description\n${ticket.description}` : "",
          ticket.acceptance_criteria
            ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}`
            : "",
          `\n---\n\n## Research Document (v1)\n\n${v1Content}`,
          `\n---\n\nCritically review the research above. Verify claims against code, find gaps, challenge assumptions, and produce an improved v2 document. Include a Critique Notes section summarizing your findings.`,
        ].join("\n");

        const doc = await runAgentPhase(
          ticket,
          persona,
          project,
          "research-v2-critic",
          systemPrompt,
          task,
          TOOLS_READONLY,
          AGENT_MAX_DURATION_MS,
          BONSAI_DIR,
          WORKTREES_DIR
        );
        if (doc) {
          insertDocument.run(ticket.id, "research", doc, 2, persona.id);
          postAgentComment(ticket.id, persona.id,
            `Critic review (v2) complete (${doc.length} chars). Researcher will finalize.`);
          log(`  COMPLETE: ${ticket.id} — critic review v2 stored (${doc.length} chars)`);
          return true;
        }
        return false;
      }
    );
    totalResult.dispatched += r.dispatched;
    totalResult.completed += r.completed;
    totalResult.skipped += r.skipped;
  }

  return totalResult;
}

// ── Phase 2: Planning ───────────────────────────
async function dispatchPlanning(
  db: Database.Database,
  maxTickets: number,
  BONSAI_DIR: string,
  WORKTREES_DIR: string
): Promise<RoundRobinResult> {
  log("=== Phase 2: PLANNING ===");

  const findTicketsNeedingPlan = db.prepare(`
    SELECT t.id, t.title, t.description, t.type, t.state, t.project_id, t.assignee_id,
           t.last_agent_activity, t.research_completed_at, t.acceptance_criteria,
           t.last_human_comment_at, t.returned_from_verification,
           t.research_approved_at, t.plan_completed_at, t.plan_approved_at
    FROM tickets t
    LEFT JOIN ticket_documents td ON td.ticket_id = t.id AND td.type = 'implementation_plan'
    WHERE t.research_approved_at IS NOT NULL
      AND t.plan_completed_at IS NULL
      AND td.id IS NULL
    ORDER BY t.priority DESC, t.created_at ASC
  `);

  const tickets = findTicketsNeedingPlan.all() as TicketRow[];

  if (tickets.length === 0) {
    log("  no tickets need planning");
    return { dispatched: 0, completed: 0, skipped: 0 };
  }

  log(`  found ${tickets.length} ticket(s) needing implementation plan`);

  const getDocumentContent = db.prepare(`
    SELECT content FROM ticket_documents
    WHERE ticket_id = ? AND type = ?
    ORDER BY version DESC LIMIT 1
  `);

  const insertDocument = db.prepare(`
    INSERT INTO ticket_documents (ticket_id, type, content, version, created_at, updated_at)
    VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const markPlanCompleted = db.prepare(`
    UPDATE tickets
    SET plan_completed_at = ?,
        plan_completed_by = ?
    WHERE id = ?
  `);

  const insertComment = db.prepare(`
    INSERT INTO comments (ticket_id, author_type, persona_id, content)
    VALUES (?, 'agent', ?, ?)
  `);

  const bumpCommentCount = db.prepare(`
    UPDATE tickets SET comment_count = comment_count + 1 WHERE id = ?
  `);

  function postAgentComment(
    ticketId: string,
    personaId: string,
    content: string
  ) {
    insertComment.run(ticketId, personaId, content);
    bumpCommentCount.run(ticketId);
  }

  return roundRobinDispatch(
    db,
    tickets,
    "developer",
    maxTickets,
    BONSAI_DIR,
    WORKTREES_DIR,
    async (ticket, persona, project) => {
      // Fetch the research document to include as context
      const researchDoc = getDocumentContent.get(
        ticket.id,
        "research"
      ) as DocRow | undefined;
      const researchContent =
        researchDoc?.content || "(No research document found)";

      const workspacePath = resolveMainRepo(project);
      const systemPrompt = buildPlannerPrompt(
        persona,
        project,
        ticket,
        workspacePath
      );
      const task = [
        `# Implementation Plan for: ${ticket.id}`,
        `## ${ticket.title}`,
        ticket.description ? `\n### Description\n${ticket.description}` : "",
        ticket.acceptance_criteria
          ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}`
          : "",
        `\n---\n\n## Research Document (approved)\n\n${researchContent}`,
        `\n---\n\nUsing the research above, create a detailed implementation plan. Be specific about files, functions, and the order of changes. Output your complete implementation plan in markdown format.`,
      ].join("\n");

      const doc = await runAgentPhase(
        ticket,
        persona,
        project,
        "plan",
        systemPrompt,
        task,
        TOOLS_READONLY,
        AGENT_MAX_DURATION_MS,
        BONSAI_DIR,
        WORKTREES_DIR
      );
      if (doc) {
        insertDocument.run(ticket.id, "implementation_plan", doc);
        markPlanCompleted.run(new Date().toISOString(), persona.id, ticket.id);
        postAgentComment(
          ticket.id,
          persona.id,
          `Completed implementation plan (${doc.length} chars). Plan is ready for review.`
        );
        log(
          `  COMPLETE: ${ticket.id} — implementation plan stored (${doc.length} chars)`
        );
        return true;
      }
      return false;
    }
  );
}

// ── Phase 3: Implementation ─────────────────────
async function dispatchImplementation(
  db: Database.Database,
  maxTickets: number,
  BONSAI_DIR: string,
  WORKTREES_DIR: string
): Promise<RoundRobinResult> {
  log("=== Phase 3: IMPLEMENTATION ===");

  const findTicketsReadyForImplementation = db.prepare(`
    SELECT t.id, t.title, t.description, t.type, t.state, t.project_id, t.assignee_id,
           t.last_agent_activity, t.research_completed_at, t.acceptance_criteria,
           t.last_human_comment_at, t.returned_from_verification,
           t.research_approved_at, t.plan_completed_at, t.plan_approved_at
    FROM tickets t
    WHERE t.plan_approved_at IS NOT NULL
      AND t.state IN ('build', 'in_progress')
      AND (t.last_agent_activity IS NULL
           OR datetime(t.last_agent_activity) < datetime('now', '-30 minutes'))
    ORDER BY t.priority DESC, t.created_at ASC
  `);

  const tickets = findTicketsReadyForImplementation.all() as TicketRow[];

  if (tickets.length === 0) {
    log("  no tickets ready for implementation");
    return { dispatched: 0, completed: 0, skipped: 0 };
  }

  log(`  found ${tickets.length} ticket(s) ready for implementation`);

  const getDocumentContent = db.prepare(`
    SELECT content FROM ticket_documents
    WHERE ticket_id = ? AND type = ?
    ORDER BY version DESC LIMIT 1
  `);

  const markTicketState = db.prepare(`
    UPDATE tickets SET state = ? WHERE id = ?
  `);

  const insertComment = db.prepare(`
    INSERT INTO comments (ticket_id, author_type, persona_id, content)
    VALUES (?, 'agent', ?, ?)
  `);

  const bumpCommentCount = db.prepare(`
    UPDATE tickets SET comment_count = comment_count + 1 WHERE id = ?
  `);

  function postAgentComment(
    ticketId: string,
    personaId: string,
    content: string
  ) {
    insertComment.run(ticketId, personaId, content);
    bumpCommentCount.run(ticketId);
  }

  return roundRobinDispatch(
    db,
    tickets,
    "developer",
    maxTickets,
    BONSAI_DIR,
    WORKTREES_DIR,
    async (ticket, persona, project) => {
      // Fetch both research and plan as context
      const researchDoc = getDocumentContent.get(
        ticket.id,
        "research"
      ) as DocRow | undefined;
      const planDoc = getDocumentContent.get(
        ticket.id,
        "implementation_plan"
      ) as DocRow | undefined;

      const researchContent = researchDoc?.content || "(No research document)";
      const planContent = planDoc?.content || "(No implementation plan)";

      const workspacePath = resolveMainRepo(project);
      const systemPrompt = buildDeveloperPrompt(
        persona,
        project,
        ticket,
        workspacePath
      );
      const task = [
        `# Implement: ${ticket.id}`,
        `## ${ticket.title}`,
        ticket.description ? `\n### Description\n${ticket.description}` : "",
        ticket.acceptance_criteria
          ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}`
          : "",
        `\n---\n\n## Research Document\n\n${researchContent}`,
        `\n---\n\n## Implementation Plan (approved)\n\n${planContent}`,
        `\n---\n\nFollow the implementation plan above step by step. Make the actual code changes. When done, summarize what you implemented.`,
      ].join("\n");

      const result = await runAgentPhase(
        ticket,
        persona,
        project,
        "implement",
        systemPrompt,
        task,
        TOOLS_FULL,
        DEVELOPER_MAX_DURATION_MS,
        BONSAI_DIR,
        WORKTREES_DIR
      );
      if (result) {
        markTicketState.run("verification", ticket.id);
        postAgentComment(
          ticket.id,
          persona.id,
          `Implementation complete. Ticket moved to verification.`
        );
        log(
          `  COMPLETE: ${ticket.id} — implementation done, moved to verification`
        );
        return true;
      }
      return false;
    }
  );
}

// ── Main export: runDispatch ────────────────────
export async function runDispatch(
  options: DispatchOptions
): Promise<DispatchResult> {
  const result: DispatchResult = {
    dispatched: 0,
    completed: 0,
    skipped: 0,
    errors: [],
  };

  // Determine paths based on environment
  const home = process.env.HOME || "~";
  const BONSAI_DIR = path.join(
    home,
    options.env === "dev" ? ".bonsai-dev" : ".bonsai"
  );
  const WORKTREES_DIR = path.join(home, ".bonsai", "worktrees");

  LOG_FILE = path.join(BONSAI_DIR, "logs", "heartbeat.log");

  // Ensure directories exist
  fs.mkdirSync(path.join(BONSAI_DIR, "logs"), { recursive: true });
  fs.mkdirSync(path.join(BONSAI_DIR, "sessions"), { recursive: true });
  fs.mkdirSync(WORKTREES_DIR, { recursive: true });

  log("heartbeat dispatch starting...");

  // Open database
  const dbFile = options.env === "dev" ? "bonsai-dev.db" : "bonsai.db";
  const dbPath = path.join(process.cwd(), dbFile);

  if (!fs.existsSync(dbPath)) {
    const err = `ERROR: database not found at ${dbPath}`;
    log(err);
    result.errors.push(err);
    throw new Error(err);
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  try {
    // Phase 1: Research
    const researchResult = await dispatchResearch(
      db,
      options.limit,
      BONSAI_DIR,
      WORKTREES_DIR
    );
    result.dispatched += researchResult.dispatched;
    result.completed += researchResult.completed;
    result.skipped += researchResult.skipped;

    // Phase 2: Planning
    const planningResult = await dispatchPlanning(
      db,
      options.limit,
      BONSAI_DIR,
      WORKTREES_DIR
    );
    result.dispatched += planningResult.dispatched;
    result.completed += planningResult.completed;
    result.skipped += planningResult.skipped;

    // Phase 3: Implementation
    const implementationResult = await dispatchImplementation(
      db,
      options.limit,
      BONSAI_DIR,
      WORKTREES_DIR
    );
    result.dispatched += implementationResult.dispatched;
    result.completed += implementationResult.completed;
    result.skipped += implementationResult.skipped;

    log(
      `dispatch complete: ${result.dispatched} dispatched, ${result.completed} completed, ${result.skipped} skipped`
    );

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    log(`ERROR: ${msg}`);
    throw err;
  } finally {
    db.close();
  }
}

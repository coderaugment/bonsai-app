/**
 * heartbeat-dispatch.ts — Three-phase ticket lifecycle automation
 *
 * Called by ~/.bonsai/heartbeat.sh every 5 minutes.
 * Opens SQLite directly (no Next.js server needed).
 *
 * Phases:
 *   1. RESEARCH — backlog tickets without research → researcher agent
 *   2. PLANNING — research-approved tickets without plan → planner agent
 *   3. IMPLEMENTATION — plan-approved tickets → developer agent
 *
 * Usage: BONSAI_ENV=dev npx tsx scripts/heartbeat-dispatch.ts
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { researcherRole } from "../../agent/src/roles/researcher.js";
import { plannerRole } from "../../agent/src/roles/planner.js";
import { developerRole } from "../../agent/src/roles/developer.js";
import { buildSystemPrompt } from "../src/lib/prompt-builder.js";

const execAsync = promisify(exec);

// ── Config ──────────────────────────────────────
const AGENT_ACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const AGENT_MAX_DURATION_MS = 5 * 60 * 1000; // 5 min per ticket
const DEVELOPER_MAX_DURATION_MS = 10 * 60 * 1000; // 10 min for implementation
const MAX_CONCURRENT = 2; // max agent runs at the same time

const env = process.env.BONSAI_ENV || "prod";
const BONSAI_DIR = path.join(
  process.env.HOME || "~",
  env === "dev" ? ".bonsai-dev" : ".bonsai"
);
const LOG_FILE = path.join(BONSAI_DIR, "logs", "heartbeat.log");

// Ensure dirs exist
fs.mkdirSync(path.join(BONSAI_DIR, "logs"), { recursive: true });
fs.mkdirSync(path.join(BONSAI_DIR, "sessions"), { recursive: true });

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

// ── Database ────────────────────────────────────
const dbFile = env === "dev" ? "bonsai-dev.db" : "bonsai.db";
const dbPath = path.join(process.cwd(), dbFile);

if (!fs.existsSync(dbPath)) {
  log(`ERROR: database not found at ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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

// ── Queries ─────────────────────────────────────

// Work Scheduler: Get actionable tickets for a project, priority-ordered
const getActionableTicketsStmt = db.prepare(`
  SELECT t.id, t.title, t.description, t.type, t.state, t.project_id, t.assignee_id,
         t.last_agent_activity, t.research_completed_at, t.acceptance_criteria,
         t.research_approved_at, t.plan_completed_at, t.plan_approved_at,
         t.last_human_comment_at, t.returned_from_verification
  FROM tickets t
  WHERE t.state != 'done'
    AND t.state != 'verification'
    AND t.project_id = ?
    AND (t.last_agent_activity IS NULL OR datetime(t.last_agent_activity) < datetime('now', '-30 minutes'))
  ORDER BY
    CASE WHEN t.last_human_comment_at IS NOT NULL THEN 1 ELSE 2 END,
    CASE WHEN t.returned_from_verification = 1 THEN 1 ELSE 2 END,
    CASE WHEN t.state = 'in_progress' THEN 1 ELSE 2 END,
    CASE WHEN t.state = 'backlog' THEN 1 ELSE 2 END,
    t.priority DESC,
    t.created_at ASC
  LIMIT 10
`);

function getActionableTickets(projectId: number): TicketRow[] {
  return getActionableTicketsStmt.all(projectId) as TicketRow[];
}

// Phase 1: Tickets needing research
const findTicketsNeedingResearch = db.prepare(`
  SELECT t.id, t.title, t.description, t.type, t.state, t.project_id, t.assignee_id,
         t.last_agent_activity, t.research_completed_at, t.acceptance_criteria
  FROM tickets t
  LEFT JOIN ticket_documents td ON td.ticket_id = t.id AND td.type = 'research'
  WHERE t.state = 'backlog'
    AND t.research_completed_at IS NULL
    AND td.id IS NULL
  ORDER BY t.priority DESC, t.created_at ASC
`);

// Phase 2: Tickets needing implementation plan
const findTicketsNeedingPlan = db.prepare(`
  SELECT t.id, t.title, t.description, t.type, t.state, t.project_id, t.assignee_id,
         t.last_agent_activity, t.research_completed_at, t.acceptance_criteria
  FROM tickets t
  LEFT JOIN ticket_documents td ON td.ticket_id = t.id AND td.type = 'implementation_plan'
  WHERE t.research_approved_at IS NOT NULL
    AND t.plan_completed_at IS NULL
    AND td.id IS NULL
  ORDER BY t.priority DESC, t.created_at ASC
`);

// Phase 3: Tickets ready for implementation
const findTicketsReadyForImplementation = db.prepare(`
  SELECT t.id, t.title, t.description, t.type, t.state, t.project_id, t.assignee_id,
         t.last_agent_activity, t.research_completed_at, t.acceptance_criteria
  FROM tickets t
  WHERE t.plan_approved_at IS NOT NULL
    AND t.state = 'in_progress'
    AND (t.last_agent_activity IS NULL
         OR datetime(t.last_agent_activity) < datetime('now', '-30 minutes'))
  ORDER BY t.priority DESC, t.created_at ASC
`);

const findPersonaByRole = db.prepare(`
  SELECT id, name, role, personality, skills, project_id, role_id
  FROM personas
  WHERE role = ?
  LIMIT 1
`);

const getRoleStmt = db.prepare(`
  SELECT id, slug, title, description, system_prompt, workflow, tools, skill_definitions
  FROM roles WHERE id = ?
`);

const getProject = db.prepare(`
  SELECT id, name, slug, github_owner, github_repo
  FROM projects WHERE id = ?
`);

const getDocumentContent = db.prepare(`
  SELECT content FROM ticket_documents
  WHERE ticket_id = ? AND type = ?
  ORDER BY version DESC LIMIT 1
`);

const markAgentActivity = db.prepare(`
  UPDATE tickets
  SET last_agent_activity = ?,
      assignee_id = ?
  WHERE id = ?
`);

const insertDocument = db.prepare(`
  INSERT INTO ticket_documents (ticket_id, type, content, version, created_at, updated_at)
  VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

const markResearchCompleted = db.prepare(`
  UPDATE tickets
  SET research_completed_at = ?,
      research_completed_by = ?
  WHERE id = ?
`);

const markPlanCompleted = db.prepare(`
  UPDATE tickets
  SET plan_completed_at = ?,
      plan_completed_by = ?
  WHERE id = ?
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

const markTicketPickedUpStmt = db.prepare(`
  UPDATE tickets
  SET last_human_comment_at = NULL,
      returned_from_verification = 0,
      last_agent_activity = ?
  WHERE id = ?
`);

function postAgentComment(ticketId: string, personaId: string, content: string) {
  insertComment.run(ticketId, personaId, content);
  bumpCommentCount.run(ticketId);
}

/**
 * Extract a useful summary from agent output (markdown).
 * Looks for a Summary/Overview heading first, falls back to first paragraph.
 */
function extractSummary(markdown: string, maxLen: number = 500): string {
  // Try to find an explicit summary section
  const summaryMatch = markdown.match(
    /^#{1,3}\s*(?:Summary|Overview|Key Findings|TL;?DR)[^\n]*\n+([\s\S]*?)(?=\n#{1,3}\s|\n---|\Z)/im
  );
  let text = summaryMatch ? summaryMatch[1].trim() : "";

  if (!text) {
    // Fall back: skip the first heading and grab the first substantial paragraph
    const lines = markdown.split("\n");
    const paragraphs: string[] = [];
    let buf = "";
    for (const line of lines) {
      if (line.startsWith("#") || line.startsWith("---")) {
        if (buf.trim().length > 40) paragraphs.push(buf.trim());
        buf = "";
        continue;
      }
      buf += line + " ";
    }
    if (buf.trim().length > 40) paragraphs.push(buf.trim());
    text = paragraphs[0] || markdown.slice(0, maxLen);
  }

  // Strip markdown formatting for cleaner comment display
  text = text
    .replace(/\*\*([^*]+)\*\*/g, "$1")    // bold
    .replace(/\*([^*]+)\*/g, "$1")          // italic
    .replace(/`([^`]+)`/g, "$1")            // inline code
    .replace(/^\s*[-*]\s+/gm, "• ")         // bullet lists
    .replace(/\n+/g, " ")                   // collapse newlines
    .trim();

  // Truncate at sentence boundary
  if (text.length > maxLen) {
    const truncated = text.slice(0, maxLen);
    const lastSentence = truncated.lastIndexOf(". ");
    text = lastSentence > maxLen * 0.4
      ? truncated.slice(0, lastSentence + 1)
      : truncated + "…";
  }

  return text;
}

function markTicketPickedUp(ticketId: string) {
  markTicketPickedUpStmt.run(new Date().toISOString(), ticketId);
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

const WORKTREES_DIR = path.join(process.env.HOME || "~", ".bonsai", "worktrees");

/**
 * Creates or reuses a git worktree for isolated ticket work.
 *
 * Worktrees provide isolated workspaces for each ticket to prevent
 * interference between concurrent agent runs. Creates a feature branch
 * `ticket/{ticketId}` and worktree at `~/.bonsai/worktrees/{project}/{ticketId}`.
 *
 * Falls back to main repo if:
 * - Not a git repository
 * - Worktree creation fails
 * - Main repo doesn't exist
 *
 * @param project - Project row with github_repo or slug
 * @param ticketId - Ticket ID (used for branch and worktree names)
 * @returns Absolute path to worktree or null if main repo not found
 */
function ensureWorktree(project: ProjectRow, ticketId: string): string | null {
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
    // Get default branch name
    const { execSync } = require("node:child_process");
    const opts = { cwd: mainRepo, encoding: "utf-8" as const, stdio: ["pipe", "pipe", "pipe"] as const };

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
    execSync(`git worktree add ${shellEscape(worktreePath)} ${branchName}`, opts);
    log(`  [${ticketId}] created worktree at ${worktreePath}`);
    return worktreePath;
  } catch (err: any) {
    const msg = err.stderr?.toString() || err.message || String(err);
    log(`  [${ticketId}] ERROR creating worktree: ${msg.trim().slice(0, 200)}`);
    // Fall back to main repo
    return mainRepo;
  }
}

// ── Claude CLI ──────────────────────────────────
const CLAUDE_CLI = path.join(process.env.HOME || "", ".local", "bin", "claude");
const MODEL = "sonnet";

const TOOLS_READONLY = ["Read", "Grep", "Glob", "Bash(git:*)"];
const TOOLS_FULL = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"];

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Runs Claude Code CLI with specified tools and timeout.
 *
 * Executes the Claude CLI in print mode (-p) with:
 * - System prompt from file
 * - Task content piped via stdin
 * - Tool restrictions (read-only for research/planning, full for implementation)
 * - Timeout with SIGTERM → SIGKILL escalation
 * - No session persistence (stateless execution)
 *
 * @param sessionDir - Directory containing task.md and system-prompt.txt
 * @param systemPrompt - System prompt content (written to promptFile)
 * @param cwd - Working directory for Claude CLI (worktree or main repo)
 * @param timeoutMs - Maximum execution time in milliseconds
 * @param tools - Allowed tools (default: read-only)
 * @returns Object with stdout, stderr, exit code, and timeout flag
 */
async function runClaude(
  sessionDir: string,
  systemPrompt: string,
  cwd: string,
  timeoutMs: number,
  tools: string[] = TOOLS_READONLY
): Promise<{ stdout: string; stderr: string; code: number; timedOut: boolean }> {
  const taskFile = path.join(sessionDir, "task.md");
  const outputFile = path.join(sessionDir, "output.md");
  const stderrFile = path.join(sessionDir, "stderr.log");
  const promptFile = path.join(sessionDir, "system-prompt.txt");

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

    const stdout = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf-8") : "";
    const stderr = fs.existsSync(stderrFile) ? fs.readFileSync(stderrFile, "utf-8") : "";
    return { stdout, stderr, code: 0, timedOut: false };
  } catch (err: any) {
    const stdout = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf-8") : "";
    const stderr = fs.existsSync(stderrFile) ? fs.readFileSync(stderrFile, "utf-8") : "";
    const timedOut = err.killed === true;
    return { stdout, stderr, code: err.code ?? 1, timedOut };
  }
}

// ── Build system prompts ────────────────────────
function buildResearchPrompt(persona: PersonaRow, project: ProjectRow, ticket: TicketRow, workspacePath: string): string {
  const roleId = persona.role_id;
  const role = roleId ? (getRoleStmt.get(roleId) as RoleRow | undefined) : undefined;

  const basePrompt = buildSystemPrompt(persona, project, ticket, {
    workspacePath,
    includeComments: true,
    commentLimit: 10,
    roleData: role,
  });

  return [
    basePrompt,
    `\n## Research Guidelines\n${researcherRole.systemPrompt}`,
    researcherRole.workflow?.outputFormat
      ? `\n## Required Output Format\n${researcherRole.workflow.outputFormat}`
      : "",
  ].join("\n");
}

function buildPlannerPrompt(persona: PersonaRow, project: ProjectRow, ticket: TicketRow, workspacePath: string): string {
  const roleId = persona.role_id;
  const role = roleId ? (getRoleStmt.get(roleId) as RoleRow | undefined) : undefined;

  const basePrompt = buildSystemPrompt(persona, project, ticket, {
    workspacePath,
    includeComments: true,
    commentLimit: 10,
    roleData: role,
  });

  return [
    basePrompt,
    `\n## Planning Guidelines\n${plannerRole.systemPrompt}`,
    plannerRole.workflow?.outputFormat
      ? `\n## Required Output Format\n${plannerRole.workflow.outputFormat}`
      : "",
  ].join("\n");
}

function buildDeveloperPrompt(persona: PersonaRow, project: ProjectRow, ticket: TicketRow, workspacePath: string): string {
  const roleId = persona.role_id;
  const role = roleId ? (getRoleStmt.get(roleId) as RoleRow | undefined) : undefined;

  const basePrompt = buildSystemPrompt(persona, project, ticket, {
    workspacePath,
    includeComments: true,
    commentLimit: 10,
    roleData: role,
  });

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
  timeoutMs: number
): Promise<string | null> {
  const workspacePath = ensureWorktree(project, ticket.id);

  if (!workspacePath) {
    return null;
  }

  const sessionDir = path.join(BONSAI_DIR, "sessions", `${ticket.id}-${phase}`);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, "system-prompt.txt"), systemPrompt);
  fs.writeFileSync(path.join(sessionDir, "task.md"), taskContent);

  log(`  [${ticket.id}] running ${phase} in ${workspacePath}`);

  try {
    const result = await runClaude(sessionDir, systemPrompt, workspacePath, timeoutMs, tools);

    fs.appendFileSync(
      path.join(sessionDir, "session.jsonl"),
      JSON.stringify({
        event: result.timedOut ? "timeout" : "complete",
        exitCode: result.code,
        outputLength: result.stdout.length,
        stderrLength: result.stderr.length,
      }) + "\n"
    );

    log(`  [${ticket.id}] ${phase} finished: code=${result.code}, output=${result.stdout.length} chars, timedOut=${result.timedOut}`);

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

/**
 * Checks if an agent is currently active on a ticket (idempotency guard).
 *
 * Prevents concurrent agent runs on the same ticket by checking if the
 * last_agent_activity timestamp is within the timeout window (30 minutes).
 * This ensures multiple heartbeat invocations don't dispatch the same ticket.
 *
 * @param ticket - Ticket row from database
 * @returns true if agent is active (timestamp within 30 min), false otherwise
 */
function isAgentActiveOnTicket(ticket: TicketRow): boolean {
  if (!ticket.last_agent_activity) return false;
  const lastActivity = new Date(ticket.last_agent_activity).getTime();
  const now = Date.now();
  return now - lastActivity < AGENT_ACTIVITY_TIMEOUT_MS;
}

interface DispatchResult {
  dispatched: number;
  completed: number;
  skipped: number;
}

/**
 * Round-robin dispatch across projects.
 *
 * Ensures fair distribution of agent work across multiple projects by
 * processing one ticket per project in rotation. Prevents a single
 * project from monopolizing agent resources.
 *
 * @param tickets - Array of tickets needing dispatch
 * @param personaRole - Role to filter personas by (e.g., 'researcher', 'planner')
 * @param maxTickets - Maximum number of tickets to dispatch (total across all projects)
 * @param runFn - Function to run for each ticket (returns true if successfully dispatched)
 * @returns Statistics about dispatched, completed, and skipped tickets
 */
async function roundRobinDispatch(
  tickets: TicketRow[],
  personaRole: string,
  maxTickets: number,
  runFn: (ticket: TicketRow, persona: PersonaRow, project: ProjectRow) => Promise<boolean>
): Promise<DispatchResult> {
  const byProject = new Map<number, { tickets: TicketRow[]; persona: PersonaRow; project: ProjectRow }>();

  for (const t of tickets) {
    if (!byProject.has(t.project_id)) {
      const persona = findPersonaByRole.get(personaRole) as PersonaRow | undefined;
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
      log(`  DISPATCH: ${ticket.id} "${ticket.title}" → ${persona.name} (${persona.id})`);
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

// ── Phase 1: Research ───────────────────────────

/**
 * Dispatches researcher agents to tickets in backlog without research documents.
 *
 * Workflow:
 * 1. Query for backlog tickets without research docs and no active agent
 * 2. Find researcher persona for each project (round-robin dispatch)
 * 3. Run Claude Code with researcher prompt and read-only tools
 * 4. Store output in ticket_documents table (type='research')
 * 5. Mark ticket.research_completed_at and post comment
 *
 * Idempotency: Skips tickets with last_agent_activity within 30 min
 *
 * @param maxTickets - Maximum number of tickets to dispatch (default: unlimited)
 * @returns Statistics about dispatched, completed, and skipped tickets
 */
async function dispatchResearch(maxTickets: number): Promise<DispatchResult> {
  log("=== Phase 1: RESEARCH ===");
  const tickets = findTicketsNeedingResearch.all() as TicketRow[];

  if (tickets.length === 0) {
    log("  no tickets need research");
    return { dispatched: 0, completed: 0, skipped: 0 };
  }

  log(`  found ${tickets.length} ticket(s) needing research`);

  return roundRobinDispatch(tickets, "researcher", maxTickets, async (ticket, persona, project) => {
    const workspacePath = resolveMainRepo(project);
    const systemPrompt = buildResearchPrompt(persona, project, ticket, workspacePath);
    const task = [
      `# Research Ticket: ${ticket.id}`,
      `## ${ticket.title}`,
      ticket.description ? `\n### Description\n${ticket.description}` : "",
      ticket.acceptance_criteria ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}` : "",
      `\nResearch this ticket thoroughly. Explore the codebase, understand the current state, identify constraints and edge cases. Output your complete research document in markdown format.`,
    ].join("\n");

    const doc = await runAgentPhase(ticket, persona, project, "research", systemPrompt, task, TOOLS_READONLY, AGENT_MAX_DURATION_MS);
    if (doc) {
      insertDocument.run(ticket.id, "research", doc);
      markResearchCompleted.run(new Date().toISOString(), persona.id, ticket.id);
      const summary = extractSummary(doc);
      postAgentComment(ticket.id, persona.id, `**Research complete**\n\n${summary}`);
      log(`  COMPLETE: ${ticket.id} — research stored (${doc.length} chars)`);
      return true;
    }
    return false;
  });
}

// ── Phase 2: Planning ───────────────────────────

/**
 * Dispatches planner agents to tickets with approved research but no implementation plan.
 *
 * Workflow:
 * 1. Query for backlog tickets with research_completed_at but no plan doc
 * 2. Find planner persona for each project (round-robin dispatch)
 * 3. Run Claude Code with planner prompt, research doc, and read-only tools
 * 4. Store output in ticket_documents table (type='implementation_plan')
 * 5. Post comment with plan summary (awaits user approval before state change)
 *
 * Idempotency: Skips tickets with last_agent_activity within 30 min
 *
 * @param maxTickets - Maximum number of tickets to dispatch
 * @returns Statistics about dispatched, completed, and skipped tickets
 */
async function dispatchPlanning(maxTickets: number): Promise<DispatchResult> {
  log("=== Phase 2: PLANNING ===");
  const tickets = findTicketsNeedingPlan.all() as TicketRow[];

  if (tickets.length === 0) {
    log("  no tickets need planning");
    return { dispatched: 0, completed: 0, skipped: 0 };
  }

  log(`  found ${tickets.length} ticket(s) needing implementation plan`);

  return roundRobinDispatch(tickets, "researcher", maxTickets, async (ticket, persona, project) => {
    // Fetch the research document to include as context
    const researchDoc = getDocumentContent.get(ticket.id, "research") as DocRow | undefined;
    const researchContent = researchDoc?.content || "(No research document found)";

    const workspacePath = resolveMainRepo(project);
    const systemPrompt = buildPlannerPrompt(persona, project, ticket, workspacePath);
    const task = [
      `# Implementation Plan for: ${ticket.id}`,
      `## ${ticket.title}`,
      ticket.description ? `\n### Description\n${ticket.description}` : "",
      ticket.acceptance_criteria ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}` : "",
      `\n---\n\n## Research Document (approved)\n\n${researchContent}`,
      `\n---\n\nUsing the research above, create a detailed implementation plan. Be specific about files, functions, and the order of changes. Output your complete implementation plan in markdown format.`,
    ].join("\n");

    const doc = await runAgentPhase(ticket, persona, project, "plan", systemPrompt, task, TOOLS_READONLY, AGENT_MAX_DURATION_MS);
    if (doc) {
      insertDocument.run(ticket.id, "implementation_plan", doc);
      markPlanCompleted.run(new Date().toISOString(), persona.id, ticket.id);
      const summary = extractSummary(doc);
      postAgentComment(ticket.id, persona.id, `**Implementation plan complete**\n\n${summary}`);
      log(`  COMPLETE: ${ticket.id} — implementation plan stored (${doc.length} chars)`);
      return true;
    }
    return false;
  });
}

// ── Phase 3: Implementation ─────────────────────

/**
 * Dispatches developer agents to tickets in in_progress state with approved plans.
 *
 * Workflow:
 * 1. Query for tickets in 'in_progress' state with plan_approved_at set
 * 2. Find developer persona (assigned via assignee_id)
 * 3. Create isolated git worktree for ticket at ~/.bonsai/worktrees/{project}/{ticketId}
 * 4. Run Claude Code with developer prompt, research + plan docs, and full tools
 * 5. Agent implements changes, creates commits, may create PR
 * 6. Move ticket to 'verification' state on completion
 *
 * Idempotency: Skips tickets with last_agent_activity within 30 min
 * Timeout: 10 minutes (longer than research/planning)
 *
 * @param maxTickets - Maximum number of tickets to dispatch
 * @returns Statistics about dispatched, completed, and skipped tickets
 */
async function dispatchImplementation(maxTickets: number): Promise<DispatchResult> {
  log("=== Phase 3: IMPLEMENTATION ===");
  const tickets = findTicketsReadyForImplementation.all() as TicketRow[];

  if (tickets.length === 0) {
    log("  no tickets ready for implementation");
    return { dispatched: 0, completed: 0, skipped: 0 };
  }

  log(`  found ${tickets.length} ticket(s) ready for implementation`);

  return roundRobinDispatch(tickets, "developer", maxTickets, async (ticket, persona, project) => {
    // Fetch both research and plan as context
    const researchDoc = getDocumentContent.get(ticket.id, "research") as DocRow | undefined;
    const planDoc = getDocumentContent.get(ticket.id, "implementation_plan") as DocRow | undefined;

    const researchContent = researchDoc?.content || "(No research document)";
    const planContent = planDoc?.content || "(No implementation plan)";

    const workspacePath = resolveMainRepo(project);
    const systemPrompt = buildDeveloperPrompt(persona, project, ticket, workspacePath);
    const task = [
      `# Implement: ${ticket.id}`,
      `## ${ticket.title}`,
      ticket.description ? `\n### Description\n${ticket.description}` : "",
      ticket.acceptance_criteria ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}` : "",
      `\n---\n\n## Research Document\n\n${researchContent}`,
      `\n---\n\n## Implementation Plan (approved)\n\n${planContent}`,
      `\n---\n\nFollow the implementation plan above step by step. Make the actual code changes. When done, summarize what you implemented.`,
    ].join("\n");

    const result = await runAgentPhase(ticket, persona, project, "implement", systemPrompt, task, TOOLS_FULL, DEVELOPER_MAX_DURATION_MS);
    if (result) {
      markTicketState.run("verification", ticket.id);
      const summary = extractSummary(result);
      postAgentComment(ticket.id, persona.id, `**Implementation complete** — moved to verification\n\n${summary}`);
      log(`  COMPLETE: ${ticket.id} — implementation done, moved to verification`);
      return true;
    }
    return false;
  });
}

// ── Main dispatch with work scheduler ──────────
async function dispatch(maxTickets: number) {
  log("heartbeat dispatch starting (work scheduler mode)...");

  // Get all projects and all personas (company-wide)
  const allProjects = db.prepare(`SELECT id FROM projects`).all() as { id: number }[];
  const allPersonas = db.prepare(`
    SELECT id, name, role, personality, skills, project_id, role_id
    FROM personas
  `).all() as PersonaRow[];

  const hasResearcher = allPersonas.some((p) => p.role === "researcher");

  let dispatched = 0;
  let completed = 0;
  let skipped = 0;

  const claimedTickets = new Set<string>(); // prevent two personas grabbing same ticket
  const busyPersonas = new Set<string>(); // prevent one persona doing two jobs at once

  // ── Phase 1: Collect all dispatchable jobs ──────────
  // Iterate projects → tickets → find persona by role
  type Job = {
    persona: PersonaRow;
    project: ProjectRow;
    ticket: TicketRow;
    phase: string;
    systemPrompt: string;
    taskContent: string;
    tools: string[];
    timeoutMs: number;
  };
  const jobs: Job[] = [];

  for (const proj of allProjects) {
    if (jobs.length >= maxTickets) break;

    const project = getProject.get(proj.id) as ProjectRow | undefined;
    if (!project) continue;

    const candidates = getActionableTickets(proj.id);

    for (const candidate of candidates) {
      if (jobs.length >= maxTickets) break;
      if (claimedTickets.has(candidate.id)) continue;

      // Determine which phase the ticket needs
      let neededPhase: string;
      if (!candidate.research_completed_at) neededPhase = "research";
      else if (!candidate.research_approved_at) neededPhase = "awaiting_approval";
      else if (!candidate.plan_completed_at) neededPhase = "plan";
      else if (!candidate.plan_approved_at) neededPhase = "awaiting_approval";
      else neededPhase = "implement";

      if (neededPhase === "awaiting_approval") continue;

      // Role selector: pick the right persona for the phase
      // Research/plan → researcher (if available), otherwise developer
      // Implement → developer
      let neededRole: string;
      if (neededPhase === "implement") {
        neededRole = "developer";
      } else {
        neededRole = hasResearcher ? "researcher" : "developer";
      }

      // Find a persona with the needed role that isn't already busy this cycle
      const persona = allPersonas.find((p) => p.role === neededRole && !busyPersonas.has(p.id));
      if (!persona) {
        // No available persona with the right role — skip
        continue;
      }

      claimedTickets.add(candidate.id);
      busyPersonas.add(persona.id);

      // Build phase-specific prompt and task
      const ticket = candidate;
      let phase: string;
      let systemPrompt: string;
      let taskContent: string;
      let tools: string[];
      let timeoutMs: number;

      if (!ticket.research_completed_at) {
        phase = "research";
        const workspacePath = resolveMainRepo(project);
        systemPrompt = buildResearchPrompt(persona, project, ticket, workspacePath);
        taskContent = [
          `# Research Ticket: ${ticket.id}`,
          `## ${ticket.title}`,
          ticket.description ? `\n### Description\n${ticket.description}` : "",
          ticket.acceptance_criteria ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}` : "",
          `\nResearch this ticket thoroughly. Explore the codebase, understand the current state, identify constraints and edge cases. Output your complete research document in markdown format.`,
        ].join("\n");
        tools = TOOLS_READONLY;
        timeoutMs = AGENT_MAX_DURATION_MS;

      } else if (!ticket.plan_completed_at) {
        phase = "plan";
        const researchDoc = getDocumentContent.get(ticket.id, "research") as DocRow | undefined;
        const researchContent = researchDoc?.content || "(No research document found)";
        const workspacePath = resolveMainRepo(project);
        systemPrompt = buildPlannerPrompt(persona, project, ticket, workspacePath);
        taskContent = [
          `# Implementation Plan for: ${ticket.id}`,
          `## ${ticket.title}`,
          ticket.description ? `\n### Description\n${ticket.description}` : "",
          ticket.acceptance_criteria ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}` : "",
          `\n---\n\n## Research Document (approved)\n\n${researchContent}`,
          `\n---\n\nUsing the research above, create a detailed implementation plan. Be specific about files, functions, and the order of changes. Output your complete implementation plan in markdown format.`,
        ].join("\n");
        tools = TOOLS_READONLY;
        timeoutMs = AGENT_MAX_DURATION_MS;

      } else {
        phase = "implement";
        const researchDoc = getDocumentContent.get(ticket.id, "research") as DocRow | undefined;
        const planDoc = getDocumentContent.get(ticket.id, "implementation_plan") as DocRow | undefined;
        const researchContent = researchDoc?.content || "(No research document)";
        const planContent = planDoc?.content || "(No implementation plan)";
        const workspacePath = resolveMainRepo(project);
        systemPrompt = buildDeveloperPrompt(persona, project, ticket, workspacePath);
        taskContent = [
          `# Implement: ${ticket.id}`,
          `## ${ticket.title}`,
          ticket.description ? `\n### Description\n${ticket.description}` : "",
          ticket.acceptance_criteria ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}` : "",
          `\n---\n\n## Research Document\n\n${researchContent}`,
          `\n---\n\n## Implementation Plan (approved)\n\n${planContent}`,
          `\n---\n\nFollow the implementation plan above step by step. Make the actual code changes. When done, summarize what you implemented.`,
        ].join("\n");
        tools = TOOLS_FULL;
        timeoutMs = DEVELOPER_MAX_DURATION_MS;
      }

      jobs.push({ persona, project, ticket, phase, systemPrompt, taskContent, tools, timeoutMs });
    }
  }

  if (jobs.length === 0) {
    log(`dispatch complete: 0 dispatched, 0 completed, ${skipped} skipped`);
    return;
  }

  // ── Phase 2: Run jobs in parallel batches of MAX_CONCURRENT ──────────
  for (let i = 0; i < jobs.length; i += MAX_CONCURRENT) {
    const batch = jobs.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (job) => {
      const { persona, project, ticket, phase, systemPrompt, taskContent, tools, timeoutMs } = job;

      log(`  DISPATCH: ${ticket.id} "${ticket.title}" → ${persona.name} (phase: ${phase})`);
      markAgentActivity.run(new Date().toISOString(), persona.id, ticket.id);
      markTicketPickedUp(ticket.id);
      dispatched++;

      const result = await runAgentPhase(ticket, persona, project, phase, systemPrompt, taskContent, tools, timeoutMs);

      if (result) {
        if (phase === "research") {
          insertDocument.run(ticket.id, "research", result);
          markResearchCompleted.run(new Date().toISOString(), persona.id, ticket.id);
          const summary = extractSummary(result);
          postAgentComment(ticket.id, persona.id, `**Research complete**\n\n${summary}`);
          log(`  COMPLETE: ${ticket.id} — research stored (${result.length} chars)`);
        } else if (phase === "plan") {
          insertDocument.run(ticket.id, "implementation_plan", result);
          markPlanCompleted.run(new Date().toISOString(), persona.id, ticket.id);
          const summary = extractSummary(result);
          postAgentComment(ticket.id, persona.id, `**Implementation plan complete**\n\n${summary}`);
          log(`  COMPLETE: ${ticket.id} — implementation plan stored (${result.length} chars)`);
        } else if (phase === "implement") {
          markTicketState.run("verification", ticket.id);
          const summary = extractSummary(result);
          postAgentComment(ticket.id, persona.id, `**Implementation complete** — moved to verification\n\n${summary}`);
          log(`  COMPLETE: ${ticket.id} — implementation done, moved to verification`);
        }
        completed++;
      } else {
        markAgentActivity.run(null, null, ticket.id);
        log(`  FAILED: ${ticket.id} — agent returned no result`);
      }
    });

    await Promise.all(promises);
  }

  log(`dispatch complete: ${dispatched} dispatched, ${completed} completed, ${skipped} skipped`);
}

// ── Main ────────────────────────────────────────
const maxPerPhase = process.argv.includes("--limit")
  ? Number(process.argv[process.argv.indexOf("--limit") + 1]) || 1
  : 2;

dispatch(maxPerPhase)
  .catch((err) => {
    log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  })
  .finally(() => {
    db.close();
  });

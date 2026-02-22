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
import { exec, execSync } from "node:child_process";
import { promisify } from "node:util";
import { researcherRole } from "../agent/src/roles/researcher.js";
import { plannerRole } from "../agent/src/roles/planner.js";
import { developerRole } from "../agent/src/roles/developer.js";
import { buildSystemPrompt } from "../src/lib/prompt-builder.js";
import { isCreditError, computePauseUntil, isPaused, pauseRemainingMs, isAuthError, AUTH_EXPIRED } from "../src/lib/credit-pause.js";

const execAsync = promisify(exec);

// ── Config ──────────────────────────────────────
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
  id: number;
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
  local_path: string | null;
}

interface DocRow {
  content: string;
}

// ── Settings (direct SQL, no Drizzle) ───────────
const getSettingStmt = db.prepare(`SELECT value FROM settings WHERE key = ?`);
const upsertSettingStmt = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const deleteSettingStmt = db.prepare(`DELETE FROM settings WHERE key = ?`);

function getSettingSync(key: string): string | null {
  const row = getSettingStmt.get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSettingSync(key: string, value: string) {
  upsertSettingStmt.run(key, value);
}

function deleteSettingSync(key: string) {
  deleteSettingStmt.run(key);
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
    AND t.state != 'test'
    AND t.state != 'ship'
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

const getRoleStmt = db.prepare(`
  SELECT id, slug, title, description, system_prompt, workflow, tools, skill_definitions
  FROM roles WHERE id = ?
`);

const getProject = db.prepare(`
  SELECT id, name, slug, github_owner, github_repo, local_path
  FROM projects WHERE id = ?
`);

const getDocumentContent = db.prepare(`
  SELECT content FROM ticket_documents
  WHERE ticket_id = ? AND type = ?
  ORDER BY version DESC LIMIT 1
`);

const getDocumentLatestVersion = db.prepare(`
  SELECT version, content FROM ticket_documents
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

// ── Agent Runs tracking ──────────────────────────
const abandonPersonaRunsStmt = db.prepare(`
  UPDATE agent_runs
  SET status = 'abandoned', completed_at = ?
  WHERE ticket_id = ? AND persona_id = ? AND status = 'running'
`);

const insertAgentRunStmt = db.prepare(`
  INSERT INTO agent_runs (ticket_id, persona_id, phase, status, tools, session_dir, dispatch_source, started_at)
  VALUES (?, ?, ?, 'running', ?, ?, 'heartbeat', ?)
`);

const completeRunByLookupStmt = db.prepare(`
  UPDATE agent_runs
  SET status = ?, completed_at = ?, duration_ms = ?, error_message = ?
  WHERE id = (
    SELECT id FROM agent_runs
    WHERE ticket_id = ? AND persona_id = ? AND status = 'running'
    ORDER BY started_at DESC LIMIT 1
  )
`);

function postAgentComment(ticketId: number, personaId: string, content: string) {
  insertComment.run(ticketId, personaId, content);
  bumpCommentCount.run(ticketId);
}

/**
 * Extract a useful summary from agent output (markdown).
 * Looks for a Summary/Overview heading first, falls back to first paragraph.
 */
function extractSummary(markdown: string, maxLen: number = 2000): string {
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
        if (buf.trim()) paragraphs.push(buf.trim());
        buf = "";
        continue;
      }
      buf += line + "\n";
    }
    if (buf.trim()) paragraphs.push(buf.trim());
    text = paragraphs[0] || markdown.slice(0, maxLen);
  }

  text = text.trim();

  // Truncate at sentence boundary if needed
  if (text.length > maxLen) {
    const truncated = text.slice(0, maxLen);
    const lastSentence = truncated.lastIndexOf(". ");
    text = lastSentence > maxLen * 0.4
      ? truncated.slice(0, lastSentence + 1)
      : truncated + "…";
  }

  return text;
}

function markTicketPickedUp(ticketId: number) {
  markTicketPickedUpStmt.run(new Date().toISOString(), ticketId);
}

// ── Workspace resolution ────────────────────────
const PROJECTS_DIR = path.join(process.env.HOME || "~", "development", "bonsai", "projects");

function resolveProjectRoot(project: ProjectRow): string {
  if (project.local_path) return project.local_path;
  const home = process.env.HOME || "~";
  if (project.github_repo === "bonsai-app") {
    return path.join(home, "development", "bonsai");
  }
  if (project.github_repo === "bonsai-agent") {
    return path.join(home, "development", "bonsai");
  }
  return path.join(PROJECTS_DIR, project.github_repo || project.slug);
}

function resolveMainRepo(project: ProjectRow): string {
  if (project.local_path) return path.join(project.local_path, "repo");
  const home = process.env.HOME || "~";
  if (project.github_repo === "bonsai-app") {
    return path.join(home, "development", "bonsai", "webapp");
  }
  if (project.github_repo === "bonsai-agent") {
    return path.join(home, "development", "bonsai", "agent");
  }
  const projectRoot = path.join(PROJECTS_DIR, project.github_repo || project.slug);
  return path.join(projectRoot, "repo");
}

/**
 * Creates or reuses a git worktree for isolated ticket work.
 *
 * Worktrees provide isolated workspaces for each ticket to prevent
 * interference between concurrent agent runs. Creates a feature branch
 * `ticket/{ticketId}` and worktree at `{projectRoot}/worktrees/{ticketId}`.
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
function formatTicketSlug(id: number): string {
  return `tkt_${String(id).padStart(2, "0")}`;
}

function ensureWorktree(project: ProjectRow, ticketId: number): string | null {
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

  const ticketSlug = formatTicketSlug(ticketId);

  // Worktrees live at {projectRoot}/worktrees/{ticketSlug}
  const projectRoot = resolveProjectRoot(project);
  const worktreesDir = path.join(projectRoot, "worktrees");
  const worktreePath = path.join(worktreesDir, ticketSlug);
  const branchName = `ticket/${ticketSlug}`;

  // If worktree already exists, reuse it
  if (fs.existsSync(worktreePath)) {
    log(`  [${ticketId}] reusing worktree at ${worktreePath}`);
    return worktreePath;
  }

  // Create worktrees directory if needed
  fs.mkdirSync(worktreesDir, { recursive: true });

  try {
    // Get default branch name
    const opts = { cwd: mainRepo, encoding: "utf-8" as const, stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"] };

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
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const msg = e.stderr?.toString() || e.message || String(err);
    log(`  [${ticketId}] ERROR creating worktree: ${msg.trim().slice(0, 200)}`);
    // Fall back to main repo
    return mainRepo;
  }
}


// ── Claude CLI ──────────────────────────────────
const CLAUDE_CLI = path.join(process.env.HOME || "", ".local", "bin", "claude");
const MODEL = "opus";
const API_BASE = process.env.API_BASE || "http://localhost:3080";

const TOOLS_READONLY = ["Read", "Grep", "Glob", "Bash", "Skill"];
const TOOLS_FULL = ["Read", "Grep", "Glob", "Write", "Edit", "Bash", "Skill"];

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
  tools: string[] = TOOLS_READONLY,
  extraEnv: Record<string, string> = {}
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
      env: { ...process.env, ...extraEnv, DISABLE_AUTOUPDATER: "1", CLAUDECODE: "" },
      timeout: timeoutMs,
      maxBuffer: 1024,
      killSignal: "SIGTERM",
    });

    const stdout = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf-8") : "";
    const stderr = fs.existsSync(stderrFile) ? fs.readFileSync(stderrFile, "utf-8") : "";
    return { stdout, stderr, code: 0, timedOut: false };
  } catch (err: unknown) {
    const stdout = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf-8") : "";
    const stderr = fs.existsSync(stderrFile) ? fs.readFileSync(stderrFile, "utf-8") : "";
    const e = err as { killed?: boolean; code?: number };
    const timedOut = e.killed === true;
    return { stdout, stderr, code: e.code ?? 1, timedOut };
  }
}

// ── Build system prompts ────────────────────────
async function buildResearchPrompt(persona: PersonaRow, project: ProjectRow, ticket: TicketRow, workspacePath: string): Promise<string> {
  const roleId = persona.role_id;
  const role = roleId ? (getRoleStmt.get(roleId) as RoleRow | undefined) : undefined;

  const basePrompt = await buildSystemPrompt(persona, project, ticket, {
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

async function buildPlannerPrompt(persona: PersonaRow, project: ProjectRow, ticket: TicketRow, workspacePath: string): Promise<string> {
  const roleId = persona.role_id;
  const role = roleId ? (getRoleStmt.get(roleId) as RoleRow | undefined) : undefined;

  const basePrompt = await buildSystemPrompt(persona, project, ticket, {
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

async function buildDeveloperPrompt(persona: PersonaRow, project: ProjectRow, ticket: TicketRow, workspacePath: string): Promise<string> {
  const roleId = persona.role_id;
  const role = roleId ? (getRoleStmt.get(roleId) as RoleRow | undefined) : undefined;

  const basePrompt = await buildSystemPrompt(persona, project, ticket, {
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
  timeoutMs: number,
  extraEnv: Record<string, string> = {}
): Promise<string | null> {
  const workspacePath = ensureWorktree(project, ticket.id);

  if (!workspacePath) {
    return null;
  }

  const sessionDir = path.join(BONSAI_DIR, "sessions", `${ticket.id}-${phase}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  // Write report helper script for progress updates
  const reportScript = path.join(sessionDir, "report.sh");
  fs.writeFileSync(reportScript, [
    `#!/usr/bin/env node`,
    `const msg = process.argv.slice(2).join(" ");`,
    `if (!msg) process.exit(0);`,
    `fetch("${API_BASE}/api/tickets/${ticket.id}/report", {`,
    `  method: "POST",`,
    `  headers: { "Content-Type": "application/json" },`,
    `  body: JSON.stringify({ personaId: "${persona.id}", content: msg }),`,
    `}).catch(() => {});`,
  ].join("\n"));
  fs.chmodSync(reportScript, 0o755);

  // Write save-document helper (LEGACY — agents should use /write-artifact skill instead)
  const saveDocScript = path.join(sessionDir, "save-document.sh");
  fs.writeFileSync(saveDocScript, [
    `#!/usr/bin/env node`,
    `const fs = require("fs");`,
    `const type = process.argv[2];`,
    `const file = process.argv[3];`,
    `if (!type || !file) { console.error("Usage: save-document.sh <type> <file>"); console.error("Types: research, implementation_plan, design"); process.exit(1); }`,
    `const content = fs.readFileSync(file, "utf-8");`,
    `if (!content.trim()) { console.error("File is empty"); process.exit(1); }`,
    `fetch("${API_BASE}/api/tickets/${ticket.id}/documents", {`,
    `  method: "POST",`,
    `  headers: { "Content-Type": "application/json" },`,
    `  body: JSON.stringify({ type, content: content.trim(), personaId: "${persona.id}" }),`,
    `}).then(r => r.json()).then(data => {`,
    `  if (data.ok) console.log(type + " v" + data.version + " saved.");`,
    `  else { console.error("Failed:", data.error, data.detail || ""); process.exit(1); }`,
    `}).catch(e => { console.error("Error:", e.message); process.exit(1); });`,
  ].join("\n"));
  fs.chmodSync(saveDocScript, 0o755);

  // Resolve tool script paths
  const nanoBananaScript = path.resolve(__dirname, "tools", "nano-banana.mjs");
  const attachFileScript = path.resolve(__dirname, "tools", "attach-file.mjs");

  // Inject progress reporting instructions into system prompt
  const reportInstructions = [
    `\n## Progress Reporting`,
    `You MUST report progress to the ticket thread as you work using: \`${reportScript} "your message"\``,
    `Post a report when you:`,
    `- **Start investigating** a new area`,
    `- **Find something significant**`,
    `- **Complete a major step**`,
    `- **Make a decision** about approach`,
    `- **Hit a blocker or uncertainty**`,
    `Keep reports short (1-3 sentences). They form the audit trail of your work.`,
  ].join("\n");

  // Inject image generation tool instructions
  // nano-banana now auto-attaches to ticket when --ticket flag is provided
  const nanoBananaInstructions = [
    `\n## Image Generation Tool (Nano Banana)`,
    `You can generate images using the Nano Banana tool. Call it via Bash:`,
    `\`\`\``,
    `node ${nanoBananaScript} --prompt "your image description" --output ./path/to/image.png --ticket ${ticket.id} --persona ${persona.id}`,
    `\`\`\``,
    `The tool uses Gemini's image generation model. Use it when you need to:`,
    `- Create logo concepts or design assets`,
    `- Generate visual mockups or illustrations`,
    `- Create icons, banners, or other graphics`,
    `Use descriptive, detailed prompts for best results.`,
    ``,
    `The --ticket and --persona flags automatically upload the generated image to the ticket as an attachment.`,
    `**Always include --ticket ${ticket.id} --persona ${persona.id}** so images appear in the ticket's Attachments section.`,
  ].join("\n");

  // Inject file attachment tool instructions (for non-generated files)
  const attachFileInstructions = [
    `\n## File Attachment Tool`,
    `For attaching non-generated files (screenshots, documents, etc.) to this ticket:`,
    `\`\`\``,
    `node ${attachFileScript} ${ticket.id} <file-path> ${persona.id}`,
    `\`\`\``,
  ].join("\n");

  // Inject acceptance criteria check-off tool
  const checkCriteriaScript = path.join(sessionDir, "check-criteria.sh");
  fs.writeFileSync(checkCriteriaScript, [
    `#!/usr/bin/env node`,
    `const idx = parseInt(process.argv[2], 10);`,
    `if (isNaN(idx)) { console.error("Usage: check-criteria.sh <index>"); process.exit(1); }`,
    `fetch("${API_BASE}/api/tickets/${ticket.id}/check-criteria", {`,
    `  method: "POST",`,
    `  headers: { "Content-Type": "application/json" },`,
    `  body: JSON.stringify({ index: idx }),`,
    `}).then(r => r.json()).then(d => {`,
    `  if (d.ok) console.log("Checked criterion " + idx);`,
    `  else console.error("Failed:", d.error);`,
    `}).catch(e => console.error(e));`,
  ].join("\n"));
  fs.chmodSync(checkCriteriaScript, 0o755);

  const checkCriteriaInstructions = ticket.acceptance_criteria ? [
    `\n## Acceptance Criteria Verification`,
    `This ticket has acceptance criteria. After implementing, you MUST verify each criterion and check it off.`,
    `Use the check-criteria tool to mark each criterion as done (0-indexed):`,
    `\`\`\``,
    `${checkCriteriaScript} 0   # checks off the first criterion`,
    `${checkCriteriaScript} 1   # checks off the second criterion`,
    `\`\`\``,
    ``,
    `The acceptance criteria are:`,
    ticket.acceptance_criteria,
    ``,
    `For each criterion:`,
    `1. Verify it is actually met (run tests, check files exist, etc.)`,
    `2. Only check it off after confirming it passes`,
    `3. If a criterion is NOT met, report what's missing via report.sh`,
  ].join("\n") : "";

  // Inject save-document instructions
  const saveDocInstructions = [
    `\n## Saving Documents`,
    `When you produce a research document, implementation plan, or design document, you MUST save it using the /write-artifact skill.`,
    ``,
    `**Steps:**`,
    `1. Write your document to a temporary file (e.g. /tmp/research.md)`,
    `2. Use the Skill tool to invoke write-artifact:`,
    `   Skill(skill: "write-artifact", args: "${ticket.id} <type> /tmp/research.md")`,
    `   Types: research, implementation_plan, design`,
    `   Example: Skill(skill: "write-artifact", args: "${ticket.id} research /tmp/research.md")`,
    `3. Your final chat response should be a brief summary (1-2 sentences), NOT the full document.`,
    ``,
    `**CRITICAL:** Do NOT output the full document as your response. Save it using the write-artifact skill. Your response is just a chat message saying you've saved the document.`,
    ``,
    `**Available artifact skills:**`,
    `- /write-artifact <ticket-id> <type> <file> — Save a document artifact`,
    `- /read-artifact <ticket-id> <type> — Read the latest artifact`,
    `- /search-artifacts <query> — Search past artifacts using semantic search`,
    `- /sync-artifacts — Sync all artifacts to QMD for search`,
  ].join("\n");

  const fullPrompt = systemPrompt + reportInstructions + saveDocInstructions + nanoBananaInstructions + attachFileInstructions + checkCriteriaInstructions;

  fs.writeFileSync(path.join(sessionDir, "system-prompt.txt"), fullPrompt);
  fs.writeFileSync(path.join(sessionDir, "task.md"), taskContent);

  log(`  [${ticket.id}] running ${phase} in ${workspacePath}`);

  // Track agent run
  const runStartedAt = new Date().toISOString();
  try { abandonPersonaRunsStmt.run(runStartedAt, ticket.id, persona.id); } catch {}
  try { insertAgentRunStmt.run(ticket.id, persona.id, phase, JSON.stringify(tools), sessionDir, runStartedAt); } catch {}

  // Stamp lastAgentActivity NOW so the board card shows the working indicator immediately
  try { markAgentActivity.run(runStartedAt, persona.id, ticket.id); } catch {}

  try {
    const result = await runClaude(sessionDir, systemPrompt, workspacePath, timeoutMs, tools, extraEnv);

    // Update agent run status
    const runDurationMs = Date.now() - new Date(runStartedAt).getTime();
    const runStatus = result.timedOut ? "timeout" : (result.code === 0 && result.stdout.trim().length > 100) ? "completed" : "failed";
    const runError = result.timedOut ? `Timed out after ${timeoutMs / 1000}s` : (runStatus === "failed" ? `Exit code ${result.code}, output ${result.stdout.length} chars` : null);
    try { completeRunByLookupStmt.run(runStatus, new Date().toISOString(), runDurationMs, runError, ticket.id, persona.id); } catch {}

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

    // ── Auth error detection ─────────────────────
    if (result.code !== 0 && isAuthError(result.stdout + result.stderr)) {
      log(`  [${ticket.id}] AUTH EXPIRED — Claude OAuth token expired, triggering Chrome re-auth`);
      setSettingSync(AUTH_EXPIRED, "true");
      markAgentActivity.run(null, null, ticket.id);
      // Trigger autonomous re-auth: opens Chrome with API key + --chrome flag
      try {
        const res = await fetch(`${API_BASE}/api/auth/reauth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const body = await res.json() as { ok: boolean; error?: string; message?: string };
        if (body.ok) {
          log(`  [${ticket.id}] Re-auth triggered: ${body.message}`);
        } else {
          log(`  [${ticket.id}] Re-auth failed: ${body.error || "unknown error"} — add CLAUDE_REAUTH_KEY to .env file`);
        }
      } catch (e) {
        log(`  [${ticket.id}] Failed to trigger re-auth: ${e instanceof Error ? e.message : String(e)}`);
      }
      return null;
    }

    // ── Credit error detection ──────────────────
    if (result.code !== 0 && isCreditError(result.stderr)) {
      const pauseUntil = computePauseUntil(result.stderr);
      setSettingSync("credits_paused_until", pauseUntil);
      setSettingSync("credits_pause_reason", result.stderr.slice(0, 500));
      log(`  [${ticket.id}] CREDIT LIMIT HIT — pausing all dispatches until ${pauseUntil}`);
      // Clear agent activity so ticket can be retried after resume
      markAgentActivity.run(null, null, ticket.id);
      return null;
    }

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
    const runDurationMs = Date.now() - new Date(runStartedAt).getTime();
    try { completeRunByLookupStmt.run("failed", new Date().toISOString(), runDurationMs, msg.slice(0, 500), ticket.id, persona.id); } catch {}
    return null;
  }
}

// ── Main dispatch with work scheduler ──────────
async function dispatch(maxTickets: number) {
  log("heartbeat dispatch starting (work scheduler mode)...");
  setSettingSync("heartbeat_last_ping", new Date().toISOString());
  setSettingSync("heartbeat_status", "running");

  // ── Auth expired check ──────────────────────────
  const authExpired = getSettingSync(AUTH_EXPIRED);
  if (authExpired === "true") {
    log(`SKIPPED: Claude OAuth token expired — waiting for re-authentication`);
    return;
  }

  // ── Credit pause check ──────────────────────────
  const pausedUntil = getSettingSync("credits_paused_until");
  if (isPaused(pausedUntil)) {
    const remaining = pauseRemainingMs(pausedUntil);
    const mins = Math.ceil(remaining / 60_000);
    log(`SKIPPED: credits paused until ${pausedUntil} (${mins}m remaining)`);
    return;
  }
  // Auto-clear expired pause
  if (pausedUntil) {
    log(`credits pause expired (was ${pausedUntil}), clearing`);
    deleteSettingSync("credits_paused_until");
    deleteSettingSync("credits_pause_reason");
  }

  // API keys are loaded from process.env (from .env file)

  // Get all projects and all personas (company-wide)
  const allProjects = db.prepare(`SELECT id FROM projects`).all() as { id: number }[];
  const allPersonas = db.prepare(`
    SELECT id, name, role, personality, skills, project_id, role_id
    FROM personas
  `).all() as PersonaRow[];

  const hasResearcher = allPersonas.some((p) => p.role === "researcher");

  let dispatched = 0;
  let completed = 0;
  const skipped = 0;

  const claimedTickets = new Set<number>(); // prevent two personas grabbing same ticket
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
      // Research → researcher (if available), otherwise developer
      // Plan/implement → developer
      let neededRole: string;
      if (neededPhase === "research") {
        neededRole = hasResearcher ? "researcher" : "developer";
      } else {
        neededRole = "developer";
      }

      // Find a persona with the needed role scoped to this ticket's project
      const persona = allPersonas.find((p) => p.role === neededRole && p.project_id === proj.id && !busyPersonas.has(p.id));
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
        systemPrompt = await buildResearchPrompt(persona, project, ticket, workspacePath);
        taskContent = [
          `# Research Ticket: ${ticket.id}`,
          `## ${ticket.title}`,
          ticket.description ? `\n### Description\n${ticket.description}` : "",
          ticket.acceptance_criteria ? `\n### Acceptance Criteria\n${ticket.acceptance_criteria}` : "",
          `\nResearch this ticket thoroughly. Explore the files inside your workspace (${resolveMainRepo(project)}), understand the current state, identify constraints and edge cases. ONLY read files inside your workspace directory. Output your complete research document in markdown format.`,
        ].join("\n");
        tools = TOOLS_READONLY;
        timeoutMs = AGENT_MAX_DURATION_MS;

      } else if (!ticket.plan_completed_at) {
        phase = "plan";
        const researchDoc = getDocumentContent.get(ticket.id, "research") as DocRow | undefined;
        const researchContent = researchDoc?.content || "(No research document found)";
        const workspacePath = resolveMainRepo(project);
        systemPrompt = await buildPlannerPrompt(persona, project, ticket, workspacePath);
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
        systemPrompt = await buildDeveloperPrompt(persona, project, ticket, workspacePath);
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

      // Snapshot doc version before agent runs, so we can detect if agent saved via API
      const docType = phase === "research" ? "research" : phase === "plan" ? "implementation_plan" : null;
      const preRunDoc = docType
        ? getDocumentLatestVersion.get(ticket.id, docType) as { version: number; content: string } | undefined
        : undefined;
      const preRunVersion = preRunDoc?.version || 0;

      const result = await runAgentPhase(ticket, persona, project, phase, systemPrompt, taskContent, tools, timeoutMs);

      if (phase === "research") {
        // Check if agent saved the document via save-document.sh (API)
        const existingDoc = getDocumentLatestVersion.get(ticket.id, "research") as { version: number; content: string } | undefined;
        if (existingDoc && existingDoc.version > preRunVersion && existingDoc.content.length > 100) {
          // Agent used save-document.sh — document is already in DB
          markResearchCompleted.run(new Date().toISOString(), persona.id, ticket.id);
          const summary = result ? extractSummary(result) : extractSummary(existingDoc.content);
          postAgentComment(ticket.id, persona.id, `**Research complete** (v${existingDoc.version})\n\n${summary}`);
          log(`  COMPLETE: ${ticket.id} — research saved via API (v${existingDoc.version}, ${existingDoc.content.length} chars)`);
          completed++;
        } else if (result) {
          // Fallback: agent used stdout — insert directly
          log(`  WARN: ${ticket.id} — agent did not use save-document.sh, falling back to stdout capture`);
          insertDocument.run(ticket.id, "research", result);
          markResearchCompleted.run(new Date().toISOString(), persona.id, ticket.id);
          const summary = extractSummary(result);
          postAgentComment(ticket.id, persona.id, `**Research complete**\n\n${summary}`);
          log(`  COMPLETE: ${ticket.id} — research stored from stdout (${result.length} chars)`);
          completed++;
        } else {
          markAgentActivity.run(null, null, ticket.id);
          log(`  FAILED: ${ticket.id} — no document saved and no stdout output`);
        }
      } else if (phase === "plan") {
        const existingDoc = getDocumentLatestVersion.get(ticket.id, "implementation_plan") as { version: number; content: string } | undefined;
        if (existingDoc && existingDoc.version > preRunVersion && existingDoc.content.length > 100) {
          markPlanCompleted.run(new Date().toISOString(), persona.id, ticket.id);
          const summary = result ? extractSummary(result) : extractSummary(existingDoc.content);
          postAgentComment(ticket.id, persona.id, `**Implementation plan complete** (v${existingDoc.version})\n\n${summary}`);
          log(`  COMPLETE: ${ticket.id} — plan saved via API (v${existingDoc.version}, ${existingDoc.content.length} chars)`);
          completed++;
        } else if (result) {
          log(`  WARN: ${ticket.id} — agent did not use save-document.sh, falling back to stdout capture`);
          insertDocument.run(ticket.id, "implementation_plan", result);
          markPlanCompleted.run(new Date().toISOString(), persona.id, ticket.id);
          const summary = extractSummary(result);
          postAgentComment(ticket.id, persona.id, `**Implementation plan complete**\n\n${summary}`);
          log(`  COMPLETE: ${ticket.id} — plan stored from stdout (${result.length} chars)`);
          completed++;
        } else {
          markAgentActivity.run(null, null, ticket.id);
          log(`  FAILED: ${ticket.id} — no plan saved and no stdout output`);
        }
      } else if (phase === "implement") {
        if (result) {
          markTicketState.run("test", ticket.id);
          const summary = extractSummary(result);
          postAgentComment(ticket.id, persona.id, `**Implementation complete** — moved to test\n\n${summary}`);
          log(`  COMPLETE: ${ticket.id} — implementation done, moved to test`);
          completed++;
        } else {
          markAgentActivity.run(null, null, ticket.id);
          log(`  FAILED: ${ticket.id} — agent returned no result`);
        }
      }
    });

    await Promise.all(promises);
  }

  log(`dispatch complete: ${dispatched} dispatched, ${completed} completed, ${skipped} skipped`);
  setSettingSync("heartbeat_last_completed", new Date().toISOString());
  setSettingSync("heartbeat_last_result", JSON.stringify({ dispatched, completed, skipped }));
  setSettingSync("heartbeat_status", "idle");

  // ── Phase 3: @mention scan ─────────────────────────────────────────────────
  // Find recent agent comments with @name/@role mentions where the mentioned
  // persona hasn't responded yet — dispatch them via the webapp API.
  await scanAndDispatchMentions();
}

// ── @mention scan ───────────────────────────────────────────────────────────
interface CommentRow { id: number; ticket_id: number; content: string; persona_id: string | null; created_at: string; project_id: number; }
interface PersonaRow2 { id: string; name: string; role: string | null; project_id: number; }

async function scanAndDispatchMentions() {
  const pausedUntil = getSettingSync("credits_paused_until");
  if (pausedUntil && isPaused(pausedUntil)) return;

  // Recent agent comments (last 15 min) on active tickets
  const recentComments = db.prepare(`
    SELECT c.id, c.ticket_id, c.content, c.persona_id, c.created_at, t.project_id
    FROM comments c
    JOIN tickets t ON t.id = c.ticket_id
    WHERE c.author_type = 'agent'
      AND c.created_at > datetime('now', '-15 minutes')
      AND t.state NOT IN ('shipped', 'cancelled')
      AND t.deleted_at IS NULL
    ORDER BY c.created_at DESC
    LIMIT 50
  `).all() as CommentRow[];

  if (recentComments.length === 0) return;

  for (const comment of recentComments) {
    const projectPersonas = db.prepare(
      `SELECT id, name, role, project_id FROM personas WHERE project_id = ?`
    ).all(comment.project_id) as PersonaRow2[];

    for (const p of projectPersonas) {
      if (p.id === comment.persona_id) continue; // skip self-mention

      const escapedName = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedRole = p.role ? p.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
      const namePattern = new RegExp(`@${escapedName}\\b`, 'i');
      const rolePattern = escapedRole ? new RegExp(`@${escapedRole}\\b`, 'i') : null;

      if (!namePattern.test(comment.content) && !(rolePattern && rolePattern.test(comment.content))) continue;

      // Check if persona already has a running agent_run for this ticket
      const running = db.prepare(
        `SELECT id FROM agent_runs WHERE ticket_id = ? AND persona_id = ? AND status = 'running'`
      ).get(comment.ticket_id, p.id);
      if (running) continue;

      // Check if persona has responded AFTER this comment
      const replied = db.prepare(
        `SELECT id FROM comments WHERE ticket_id = ? AND persona_id = ? AND created_at > ?`
      ).get(comment.ticket_id, p.id, comment.created_at);
      if (replied) continue;

      // Dispatch via webapp API
      log(`  @mention scan: dispatching ${p.name} (${p.role}) to ticket ${comment.ticket_id} — mentioned in comment ${comment.id}`);
      try {
        const res = await fetch(`${API_BASE}/api/tickets/${comment.ticket_id}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commentContent: comment.content,
            targetPersonaId: p.id,
            conversational: true,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          log(`  @mention scan: dispatch failed ${res.status}: ${body.slice(0, 100)}`);
        }
      } catch (e) {
        log(`  @mention scan: dispatch error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}

// ── Main ────────────────────────────────────────
// REDUCED TO 1 TO LIMIT API USAGE - agents work on ONE ticket at a time
const maxPerPhase = process.argv.includes("--limit")
  ? Number(process.argv[process.argv.indexOf("--limit") + 1]) || 1
  : 1;

dispatch(maxPerPhase)
  .catch((err) => {
    log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  })
  .finally(() => {
    db.close();
  });

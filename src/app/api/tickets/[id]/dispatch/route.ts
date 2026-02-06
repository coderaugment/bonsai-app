/**
 * POST /api/tickets/[id]/dispatch
 *
 * Spawns a detached Claude agent process for ticket execution.
 *
 * Flow:
 * 1. Fetch ticket, project, and available personas
 * 2. If PM persona exists, run PM triage to select best agent for task
 * 3. Create session directory at ~/.bonsai/sessions/{ticketId}-comment-{timestamp}/
 * 4. Generate system prompt and task files with ticket context
 * 5. Spawn detached `claude` CLI process with role-specific tool restrictions
 * 6. Agent posts updates via webhook to /api/tickets/[id]/report
 * 7. Agent posts final output to /api/tickets/[id]/agent-complete
 *
 * The agent runs independently - this endpoint returns immediately.
 *
 * Tool restrictions:
 * - Researcher/Designer: Read-only tools (Read, Grep, Glob, Bash git)
 * - Developer/Manager: Full tools (Read, Grep, Glob, Write, Edit, Bash)
 *
 * @route POST /api/tickets/:id/dispatch
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, personas, comments, projects } from "@/db/schema";
import { eq, or, isNull } from "drizzle-orm";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";

const execAsync = promisify(exec);

// ── Config (mirrors agent/src/lib/dispatcher.ts) ──────────
const HOME = process.env.HOME || "~";
const CLAUDE_CLI = path.join(HOME, ".local", "bin", "claude");
const MODEL = "sonnet";
const BONSAI_DIR = path.join(HOME, ".bonsai");

const TOOLS_READONLY = ["Read", "Grep", "Glob", 'Bash(git:*)'];
const TOOLS_FULL = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"];

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function resolveMainRepo(project: { githubRepo: string | null; slug: string }): string {
  if (project.githubRepo === "bonsai-app") {
    return path.join(HOME, "development", "bonsai", "webapp");
  }
  if (project.githubRepo === "bonsai-agent") {
    return path.join(HOME, "development", "bonsai", "agent");
  }
  return path.join(HOME, "development", project.githubRepo || project.slug);
}

/**
 * PM Triage - Uses PM persona to analyze ticket and select best agent.
 *
 * Runs a quick (max 1 turn) Claude invocation with the PM persona to determine:
 * - Which role should handle this ticket (researcher, planner, developer, etc.)
 * - Which specific persona is best suited
 * - Reasoning for the selection
 *
 * The PM acts as a "router" that triages incoming tickets and assigns them
 * to the most appropriate specialist agent.
 *
 * @param sessionDir - Path to session directory containing task.md and system-prompt.txt
 * @param cwd - Working directory for the Claude CLI process
 * @returns Triage decision with role, personaId, and reason, or null if failed
 * @private
 */
async function pmTriage(
  sessionDir: string,
  cwd: string
): Promise<{ role: string; personaId: string; reason: string } | null> {
  const taskFile = path.join(sessionDir, "task.md");
  const outputFile = path.join(sessionDir, "pm-output.json");
  const stderrFile = path.join(sessionDir, "pm-stderr.log");
  const promptFile = path.join(sessionDir, "system-prompt.txt");

  const cmd = [
    `cat ${shellEscape(taskFile)} |`,
    shellEscape(CLAUDE_CLI),
    `-p`,
    `--model ${MODEL}`,
    `--max-turns 1`,
    `--output-format json`,
    `--no-session-persistence`,
    `--append-system-prompt "$(cat ${shellEscape(promptFile)})"`,
    `> ${shellEscape(outputFile)} 2> ${shellEscape(stderrFile)}`,
  ].join(" ");

  try {
    await execAsync(cmd, {
      cwd,
      env: { ...process.env, DISABLE_AUTOUPDATER: "1" },
      timeout: 30_000, // 30s max for PM triage
      maxBuffer: 1024,
      killSignal: "SIGTERM",
    });
  } catch {
    // timed out or errored — read whatever output exists
  }

  if (!fs.existsSync(outputFile)) return null;

  const raw = fs.readFileSync(outputFile, "utf-8").trim();
  if (!raw) return null;

  // output-format json wraps the response — extract the result text
  try {
    const envelope = JSON.parse(raw);
    // Claude --output-format json returns { result: "..." } or an array of content blocks
    let text = "";
    if (typeof envelope.result === "string") {
      text = envelope.result;
    } else if (Array.isArray(envelope)) {
      // array of content blocks
      text = envelope
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("");
    } else if (typeof envelope === "string") {
      text = envelope;
    }

    // Extract JSON object from the text (PM may wrap it in markdown code fences)
    const jsonMatch = text.match(/\{[\s\S]*?"role"[\s\S]*?"personaId"[\s\S]*?"reason"[\s\S]*?\}/);
    if (!jsonMatch) return null;

    const decision = JSON.parse(jsonMatch[0]);
    if (decision.role && decision.personaId && decision.reason) {
      return decision;
    }
  } catch {
    // parse failed
  }

  return null;
}

// ── Agent Spawn (fire-and-forget) ────────────────────
function spawnAgent(
  sessionDir: string,
  cwd: string,
  tools: string[]
) {
  const taskFile = path.join(sessionDir, "task.md");
  const outputFile = path.join(sessionDir, "output.md");
  const stderrFile = path.join(sessionDir, "stderr.log");
  const promptFile = path.join(sessionDir, "system-prompt.txt");

  // Build the shell command — same pattern as dispatcher.ts
  const cmd = [
    `cat ${shellEscape(taskFile)} |`,
    shellEscape(CLAUDE_CLI),
    `-p`,
    `--model ${MODEL}`,
    `--allowedTools "${tools.join(",")}"`,
    `--output-format text`,
    `--no-session-persistence`,
    `--append-system-prompt "$(cat ${shellEscape(promptFile)})"`,
    `> ${shellEscape(outputFile)} 2> ${shellEscape(stderrFile)}`,
  ].join(" ");

  // Fire-and-forget: detached process, stdio ignored, unref'd
  const child = spawn("sh", ["-c", cmd], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, DISABLE_AUTOUPDATER: "1" },
  });
  child.unref();
}

// ── Helpers ──────────────────────────────────────────
function postAgentComment(
  ticketId: string,
  personaId: string,
  content: string
) {
  db.insert(comments)
    .values({
      ticketId,
      authorType: "agent",
      personaId,
      content,
    })
    .run();

  // Bump comment count
  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (ticket) {
    db.update(tickets)
      .set({ commentCount: (ticket.commentCount || 0) + 1 })
      .where(eq(tickets.id, ticketId))
      .run();
  }
}

/**
 * Get allowed tools for a given agent role.
 *
 * Tool restrictions ensure agents operate within appropriate boundaries:
 * - Researcher/Designer: Read-only access for exploration and analysis
 * - Developer/Manager: Full access for implementation and oversight
 *
 * @param role - The agent role (researcher, designer, developer, manager, etc.)
 * @returns Array of allowed tool names
 * @private
 */
function toolsForRole(role: string): string[] {
  if (role === "researcher") return TOOLS_READONLY;
  if (role === "designer") return TOOLS_READONLY;
  return TOOLS_FULL; // developer, manager
}

// ── POST /api/tickets/[id]/dispatch ──────────────────
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;
  const { commentContent } = await req.json();

  // Fetch ticket
  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Fetch project
  const project = ticket.projectId
    ? db.select().from(projects).where(eq(projects.id, ticket.projectId)).get()
    : null;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Fetch all personas — company-wide (NULL projectId) + any project-specific
  const projectPersonas = db
    .select()
    .from(personas)
    .where(or(eq(personas.projectId, project.id), isNull(personas.projectId)))
    .all();

  // Find the PM persona — if none, pick best available agent and skip triage
  const pmPersona = projectPersonas.find((p) => p.role === "manager");
  if (!pmPersona) {
    // No PM — pick best agent: researcher > developer > anyone
    const fallbackPersona =
      projectPersonas.find((p) => p.role === "researcher") ||
      projectPersonas.find((p) => p.role === "developer") ||
      projectPersonas[0];
    if (!fallbackPersona) {
      return NextResponse.json({ error: "No personas available" }, { status: 400 });
    }

    const sessionDir = path.join(
      BONSAI_DIR,
      "sessions",
      `${ticketId}-comment-${Date.now()}`
    );
    fs.mkdirSync(sessionDir, { recursive: true });

    const cwd = resolveMainRepo(project);

    fs.writeFileSync(
      path.join(sessionDir, "system-prompt.txt"),
      buildAgentSystemPrompt(fallbackPersona, project, ticket)
    );
    fs.writeFileSync(
      path.join(sessionDir, "task.md"),
      assembleAgentTask(commentContent, ticket, fallbackPersona)
    );

    const tools = toolsForRole(fallbackPersona.role || "developer");
    spawnAgent(sessionDir, cwd, tools);

    // Post a visible dispatch comment (no PM, so the agent "self-assigns")
    const dispatchMsg = `Picking up this comment. Looking into it now.`;
    postAgentComment(ticketId, fallbackPersona.id, dispatchMsg);

    // Set last_agent_activity to prevent heartbeat overlap
    db.update(tickets)
      .set({ lastAgentActivity: new Date().toISOString() })
      .where(eq(tickets.id, ticketId))
      .run();

    const fallbackComment = {
      id: Date.now(),
      ticketId,
      authorType: "agent" as const,
      author: {
        name: fallbackPersona.name,
        avatarUrl: fallbackPersona.avatar || undefined,
        color: fallbackPersona.color,
      },
      content: dispatchMsg,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      persona: {
        id: fallbackPersona.id,
        name: fallbackPersona.name,
        role: fallbackPersona.role,
      },
      pmComment: fallbackComment,
    });
  }

  // ── PM Triage ──────────────────────────────
  const sessionDir = path.join(
    BONSAI_DIR,
    "sessions",
    `${ticketId}-comment-${Date.now()}`
  );
  fs.mkdirSync(sessionDir, { recursive: true });
  const cwd = resolveMainRepo(project);

  // Build the PM's available-personas list (excluding PM itself)
  const availablePersonas = projectPersonas
    .filter((p) => p.role !== "manager")
    .map((p) => `- ${p.name} (id: ${p.id}, role: ${p.role})`)
    .join("\n");

  // Write PM system prompt
  const pmSystemPrompt = [
    `You are ${pmPersona.name}, the Project Manager for ${project.name}.`,
    pmPersona.personality ? `Personality: ${pmPersona.personality}` : "",
    "",
    "Your job is to read a user's comment on a ticket and decide which team member should handle it.",
    "Respond with ONLY a JSON object (no markdown, no explanation):",
    '{ "role": "<researcher|developer|designer>", "personaId": "<id>", "reason": "<one sentence>" }',
    "",
    "Available team members:",
    availablePersonas,
  ]
    .filter(Boolean)
    .join("\n");

  fs.writeFileSync(path.join(sessionDir, "system-prompt.txt"), pmSystemPrompt);

  // Write PM task (the comment + ticket context)
  const pmTask = [
    `# Ticket: ${ticket.title}`,
    `ID: ${ticket.id} | State: ${ticket.state} | Type: ${ticket.type}`,
    ticket.description ? `\nDescription:\n${ticket.description}` : "",
    "",
    "## User Comment (just posted)",
    commentContent,
    "",
    "Decide which team member should handle this. Respond with JSON only.",
  ]
    .filter(Boolean)
    .join("\n");

  fs.writeFileSync(path.join(sessionDir, "task.md"), pmTask);

  // Run PM triage (synchronous, ~5-10s)
  const decision = await pmTriage(sessionDir, cwd);

  // Resolve the assigned persona
  let assignedPersona = decision
    ? projectPersonas.find((p) => p.id === decision.personaId)
    : null;

  // Fallback if PM picked an invalid persona
  if (!assignedPersona) {
    assignedPersona =
      projectPersonas.find((p) => p.role === "developer") ||
      projectPersonas.find((p) => p.role !== "manager") ||
      null;
  }

  if (!assignedPersona) {
    return NextResponse.json({ error: "No suitable agent found" }, { status: 400 });
  }

  const reason = decision?.reason || "Handling this comment";

  // Post PM comment
  const pmCommentContent = `Assigning to **${assignedPersona.name}** to handle this. ${reason}`;
  postAgentComment(ticketId, pmPersona.id, pmCommentContent);

  // Enrich PM comment for frontend response
  const pmComment = {
    id: Date.now(), // approximate — real ID from DB
    ticketId,
    authorType: "agent" as const,
    author: {
      name: pmPersona.name,
      avatarUrl: pmPersona.avatar || undefined,
      color: pmPersona.color,
    },
    content: pmCommentContent,
    createdAt: new Date().toISOString(),
  };

  // ── Spawn the assigned agent (fire-and-forget) ──────
  const agentSessionDir = path.join(
    BONSAI_DIR,
    "sessions",
    `${ticketId}-agent-${Date.now()}`
  );
  fs.mkdirSync(agentSessionDir, { recursive: true });

  fs.writeFileSync(
    path.join(agentSessionDir, "system-prompt.txt"),
    buildAgentSystemPrompt(assignedPersona, project, ticket)
  );
  fs.writeFileSync(
    path.join(agentSessionDir, "task.md"),
    assembleAgentTask(commentContent, ticket, assignedPersona)
  );

  spawnAgent(agentSessionDir, cwd, toolsForRole(assignedPersona.role || "developer"));

  // Set last_agent_activity to prevent heartbeat overlap
  db.update(tickets)
    .set({ lastAgentActivity: new Date().toISOString() })
    .where(eq(tickets.id, ticketId))
    .run();

  return NextResponse.json({
    persona: {
      id: assignedPersona.id,
      name: assignedPersona.name,
      role: assignedPersona.role,
    },
    pmComment,
  });
}

// ── System prompt builder ────────────────────────────
function buildAgentSystemPrompt(
  persona: typeof personas.$inferSelect,
  project: typeof projects.$inferSelect,
  ticket: typeof tickets.$inferSelect
): string {
  const workspace = resolveMainRepo(project);

  return [
    `You are ${persona.name}, working on ticket ${ticket.id} for project ${project.name}.`,
    `Workspace: ${workspace}`,
    persona.personality ? `\nPersonality: ${persona.personality}` : "",
    `\nYour role is ${persona.role}. Respond to the user's comment on this ticket.`,
    `When you are done, post your findings or changes as a comment by writing your final answer.`,
    `Your output will be saved and posted as a comment on the ticket.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Agent task assembler ─────────────────────────────
// TODO: This is your decision point — how much ticket context should the
// agent receive? The quoted text, the user's comment, ticket metadata,
// documents, recent comments — mix and match based on what you think
// will give the agent the best context to do useful work.
//
// Trade-offs to consider:
// - More context = better understanding, but longer prompt = slower + more tokens
// - Including full documents helps for code review comments but may be noise for simple questions
// - Recent comments give conversation thread context but may confuse the agent if lengthy
function assembleAgentTask(
  commentContent: string,
  ticket: typeof tickets.$inferSelect,
  persona: typeof personas.$inferSelect
): string {
  // TODO(you): Customize the task assembly below (~5-10 lines).
  // The commentContent already includes the quoted text (as "> lines")
  // plus the user's actual comment, formatted by the frontend.

  return [
    `# Ticket: ${ticket.title}`,
    `ID: ${ticket.id} | State: ${ticket.state} | Type: ${ticket.type}`,
    ticket.description ? `\n## Description\n${ticket.description}` : "",
    ticket.acceptanceCriteria
      ? `\n## Acceptance Criteria\n${ticket.acceptanceCriteria}`
      : "",
    "",
    "## User Comment (respond to this)",
    commentContent,
    "",
    `You are ${persona.name} (${persona.role}). Address the user's comment above.`,
    "Write your response as a clear, actionable comment.",
  ]
    .filter(Boolean)
    .join("\n");
}

import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, personas, comments, projects, ticketDocuments } from "@/db/schema";
import { eq, or, isNull, desc } from "drizzle-orm";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { getSetting } from "@/db/queries";

// ── Config ──────────────────────────────────────────
const HOME = process.env.HOME || "~";
const CLAUDE_CLI = path.join(HOME, ".local", "bin", "claude");
const MODEL = "sonnet";
const BONSAI_DIR = path.join(HOME, ".bonsai");
const API_BASE = "http://localhost:3000";

const TOOLS_READONLY = ["Read", "Grep", "Glob", "Bash"];
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

// ── Agent Spawn (fire-and-forget, posts back when done) ──
function spawnAgent(
  sessionDir: string,
  cwd: string,
  tools: string[],
  ticketId: string,
  personaId: string
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

  const claudeCmd = [
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

  // After claude finishes, post the output to agent-complete endpoint
  const postScriptFile = path.join(sessionDir, "post-output.mjs");
  fs.writeFileSync(postScriptFile, [
    `import fs from "fs";`,
    `const output = fs.readFileSync(${JSON.stringify(outputFile)}, "utf-8").trim();`,
    `if (!output) process.exit(0);`,
    `try {`,
    `  const res = await fetch(${JSON.stringify(`${API_BASE}/api/tickets/${ticketId}/agent-complete`)}, {`,
    `    method: "POST",`,
    `    headers: { "Content-Type": "application/json" },`,
    `    body: JSON.stringify({ personaId: ${JSON.stringify(personaId)}, content: output }),`,
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
    env: { ...process.env, DISABLE_AUTOUPDATER: "1" },
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

function toolsForRole(role: string): string[] {
  if (role === "researcher") return TOOLS_READONLY;
  if (role === "designer") return TOOLS_READONLY;
  if (role === "skeptic") return TOOLS_READONLY;
  return TOOLS_FULL;
}

// Determine which role should handle based on ticket state
function resolveTargetRole(ticket: typeof tickets.$inferSelect): string {
  // Research not approved yet → researcher handles it
  if (!ticket.researchApprovedAt) return "researcher";
  // Research approved but plan not approved → developer builds the plan
  if (!ticket.planApprovedAt) return "developer";
  // Both approved → developer implements
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

  return { enrichedComments, researchDoc, implPlan };
}

// ── POST /api/tickets/[id]/dispatch ──────────────────
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;
  const { commentContent } = await req.json();

  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const project = ticket.projectId
    ? db.select().from(projects).where(eq(projects.id, ticket.projectId)).get()
    : null;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Get all personas for this project
  const projectPersonas = db.select().from(personas)
    .where(or(eq(personas.projectId, project.id), isNull(personas.projectId)))
    .all();

  // Route directly based on ticket phase — no PM triage
  const targetRole = resolveTargetRole(ticket);
  const targetPersona = projectPersonas.find((p) => p.role === targetRole)
    || projectPersonas.find((p) => p.role === "developer")
    || projectPersonas.find((p) => p.role !== "manager")
    || projectPersonas[0];

  if (!targetPersona) {
    return NextResponse.json({ error: "No personas available" }, { status: 400 });
  }

  const cwd = resolveMainRepo(project);

  // Create agent session
  const sessionDir = path.join(BONSAI_DIR, "sessions", `${ticketId}-agent-${Date.now()}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  fs.writeFileSync(
    path.join(sessionDir, "system-prompt.txt"),
    buildAgentSystemPrompt(targetPersona, project, ticket, sessionDir)
  );
  fs.writeFileSync(
    path.join(sessionDir, "task.md"),
    assembleAgentTask(commentContent, ticket, targetPersona)
  );

  // Spawn the agent (fire-and-forget, posts comment when done)
  spawnAgent(sessionDir, cwd, toolsForRole(targetPersona.role || "developer"), ticketId, targetPersona.id);

  // Post a brief "working on it" comment
  const ackMsg = `Looking into this now.`;
  postAgentComment(ticketId, targetPersona.id, ackMsg);

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
  sessionDir: string
): string {
  const workspace = resolveMainRepo(project);
  const reportScript = path.join(sessionDir, "report.sh");

  // Role prompts: read from settings (editable in Settings > Prompts), fall back to defaults
  const defaultRolePrompts: Record<string, string> = {
    researcher: "You are a researcher. Your stdout IS the research document — output ONLY structured markdown, no preamble or conversational wrapper.\n\n## How to research\nInvestigate the codebase: read files, search code, understand architecture. Reference specific file paths and line numbers.\n\n## What to include\nFor every finding, show your work:\n- **What you looked at**: which files, functions, patterns you examined and why\n- **What you found**: the relevant code, config, or architecture detail\n- **Why it matters**: how this finding affects the ticket's implementation\n\nStructure the document with a \"Research Log\" section that traces your investigation path — what you searched for, what you found, what led you to look deeper. The reader should be able to follow your reasoning and verify your conclusions.\n\n## Style\nBe concise — only include information a developer needs to start planning. Skip obvious architecture descriptions.\nNever say \"I've created a document\" or \"here's what I found.\" Just output the document directly.\nIf the user is answering questions you asked in the research document, incorporate their answers into your analysis.",
    developer: "You are a developer. You can read, write, and edit code in the workspace.\nImplement changes, fix bugs, or prototype solutions as requested.\nMake targeted changes — don't refactor unrelated code.",
    designer: "You are a designer. Review the UI/UX, suggest improvements, and analyze the design system.\nReference specific components, CSS variables, and layout patterns.",
    skeptic: "You are a skeptic and devil's advocate. Challenge assumptions, find holes in reasoning, and stress-test proposals.\nYou NEVER edit files or write code. You only read and comment.\nBe direct, specific, and constructive. Don't just say 'this might fail' — explain HOW it could fail and what to do about it.",
  };
  const role = persona.role || "developer";
  const roleInstructions = getSetting(`prompt_role_${role}`) || defaultRolePrompts[role] || defaultRolePrompts.developer;

  return [
    `You are ${persona.name}, working on project "${project.name}".`,
    `Workspace: ${workspace}`,
    persona.personality ? `\nPersonality:\n${persona.personality}` : "",
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
    "",
    "## Output",
    "Your entire stdout output will be posted as a comment on the ticket thread.",
    "Write your response as a clear, well-formatted markdown comment.",
    "Address the user's message directly. Include code snippets, file references, or findings as appropriate.",
    "Keep it focused — this is a comment in a conversation, not a dissertation.",
  ].filter(Boolean).join("\n");
}

// ── Agent task assembler ─────────────────────────────
function assembleAgentTask(
  commentContent: string,
  ticket: typeof tickets.$inferSelect,
  persona: typeof personas.$inferSelect
): string {
  const { enrichedComments, researchDoc, implPlan } = getTicketContext(ticket.id);

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
    const content = researchDoc.content.length > 3000
      ? researchDoc.content.slice(0, 3000) + "\n\n[...truncated]"
      : researchDoc.content;
    sections.push("", "## Research Document (v" + researchDoc.version + ")", content);
  }
  if (implPlan) {
    const content = implPlan.content.length > 3000
      ? implPlan.content.slice(0, 3000) + "\n\n[...truncated]"
      : implPlan.content;
    sections.push("", "## Implementation Plan (v" + implPlan.version + ")", content);
  }

  if (enrichedComments.length > 0) {
    sections.push("", "## Recent Comments");
    sections.push(...enrichedComments.map((c) => c + "\n---"));
  }

  sections.push(
    "",
    "## New Comment (respond to this)",
    commentContent,
    "",
    `You are ${persona.name} (${persona.role}). Address the comment above.`,
  );

  return sections.join("\n");
}

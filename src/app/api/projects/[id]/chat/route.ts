import { NextResponse } from "next/server";
import { getProjectMessages, createProjectMessage } from "@/db/data/project-messages";
import { getProjectPersonasRaw } from "@/db/data/personas";
import { getProjectById } from "@/db/data/projects";
import { createTicket, getTicketsByProject, updateTicket } from "@/db/data/tickets";
import { fireDispatch } from "@/lib/dispatch-agent";

/** GET — fetch project chat messages */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit")) || 100;

  const messages = await getProjectMessages(projectId, limit);
  return NextResponse.json(messages);
}

/** POST — create a human message, extract @mentions, dispatch agent */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);
  const { content, authorId } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Save human message
  const msg = await createProjectMessage({
    projectId,
    authorType: "human",
    authorId: authorId || 1,
    content: content.trim(),
  });

  // Extract @mentions from content
  const projectPersonas = await getProjectPersonasRaw(projectId);
  const trimmed = content.trim();

  // Find mentioned personas (by name or role)
  const sorted = [...projectPersonas].sort((a, b) => b.name.length - a.name.length);
  const mentionedIds: string[] = [];

  for (const p of sorted) {
    const pattern = new RegExp(`@${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(trimmed) && !mentionedIds.includes(p.id)) {
      mentionedIds.push(p.id);
    }
  }

  // Check for @team mention
  const isTeam = /@team\b/i.test(trimmed);

  // Dispatch via inbox ticket — route to mentioned personas, or lead by default
  const inboxTicketId = await ensureInboxTicket(projectId);

  if (isTeam) {
    fireDispatch("http://localhost:3080", inboxTicketId, {
      commentContent: trimmed,
      team: true,
      silent: true,
      conversational: true,
    }, "project-chat/@team");
  } else if (mentionedIds.length > 0) {
    for (const personaId of mentionedIds) {
      fireDispatch("http://localhost:3080", inboxTicketId, {
        commentContent: trimmed,
        targetPersonaId: personaId,
        conversational: true,
        silent: true,
      }, `project-chat/@mention`);
    }
  } else {
    // No @mention — route to @lead
    fireDispatch("http://localhost:3080", inboxTicketId, {
      commentContent: trimmed,
      targetRole: "lead",
      conversational: true,
      silent: true,
    }, "project-chat/lead");
  }

  return NextResponse.json({ ok: true, message: msg });
}

/**
 * Ensure an inbox ticket exists for the project.
 * Hidden chore used as a dispatch target for project-level chat.
 * Has deletedAt set so it doesn't appear on the board.
 */
async function ensureInboxTicket(projectId: number): Promise<number> {
  const existing = await getTicketsByProject(projectId, "[Inbox]");
  if (existing) {
    return existing.id;
  }

  const ticket = await createTicket({
    title: "[Inbox]",
    type: "chore",
    state: "building",
    description: "Hidden inbox ticket for project-level chat dispatch.",
    priority: 0,
    projectId,
  });

  // Soft-delete so it doesn't appear on the board
  await updateTicket(ticket.id, { deletedAt: new Date().toISOString() });

  return ticket.id;
}

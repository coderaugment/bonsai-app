import { NextResponse } from "next/server";
import { getTicketById } from "@/db/data/tickets";
import { createCommentAndBumpCount } from "@/db/data/comments";
import { getPersonaRaw, getProjectPersonasRaw } from "@/db/data/personas";
import { logAuditEvent } from "@/db/data/audit";
import { fireDispatch } from "@/lib/dispatch-agent";

// Called by the agent wrapper script when claude -p finishes.
// Posts the agent's final output as a chat comment.
// Documents are saved separately via the save-document.sh tool → POST /api/tickets/[id]/documents.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;
  const { personaId, content, documentId } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "empty output" }, { status: 400 });
  }

  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  const trimmed = content.trim();

  const completingPersona = personaId
    ? await getPersonaRaw(personaId)
    : null;
  const agentName = completingPersona?.name ?? "Agent";

  // ── Post chat comment ──────────────────────────────────
  await createCommentAndBumpCount({
    ticketId,
    authorType: "agent",
    personaId: personaId || null,
    content: trimmed,
    documentId: documentId || null,
  });

  // ── Agent @mention dispatch ────────────────────────────
  const projectPersonas = ticket.projectId
    ? await getProjectPersonasRaw(ticket.projectId)
    : [];

  const sorted = [...projectPersonas].sort((a, b) => b.name.length - a.name.length);
  const mentioned = new Set<string>();

  for (const p of sorted) {
    if (p.id === personaId) continue;
    const pattern = new RegExp(`@${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(trimmed) && !mentioned.has(p.id)) {
      mentioned.add(p.id);
      console.log(`[agent-complete] Agent ${personaId} mentioned @${p.name} — dispatching`);
      fireDispatch("http://localhost:3000", ticketId, {
        commentContent: trimmed,
        targetPersonaId: p.id,
        conversational: true,
        silent: true,
      }, `agent-complete/@${p.name}`);
    }
  }

  // ── Audit ──────────────────────────────────────────────
  await logAuditEvent({
    ticketId,
    event: "agent_completed",
    actorType: "agent",
    actorId: personaId,
    actorName: agentName,
    detail: `${agentName} completed work`,
    metadata: { role: completingPersona?.role || "unknown" },
  });

  return NextResponse.json({ ok: true });
}

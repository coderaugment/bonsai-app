import { NextResponse } from "next/server";
import { getTicketById } from "@/db/data/tickets";
import { createCommentAndBumpCount } from "@/db/data/comments";
import { getPersonaRaw, getProjectPersonasRaw } from "@/db/data/personas";
import { logAuditEvent } from "@/db/data/audit";
import { completeAgentRun } from "@/db/data/agent-runs";
import { fireDispatch } from "@/lib/dispatch-agent";

// Called by the agent wrapper script when claude -p finishes.
// Posts the agent's final output as a chat comment.
// Documents are saved separately via the save-document.sh tool → POST /api/tickets/[id]/documents.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);
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

  // ── Lead triage handoff ─────────────────────────────────
  // When @lead finishes evaluating a new ticket and didn't promote it to epic,
  // auto-dispatch researcher and designer with proper phase prompts.
  const freshTicket = await getTicketById(ticketId);
  if (
    completingPersona?.role === "lead" &&
    freshTicket &&
    freshTicket.state === "review" &&
    !freshTicket.isEpic
  ) {
    const ticketSummary = `${freshTicket.title}${freshTicket.description ? `\n\n${freshTicket.description}` : ""}${freshTicket.acceptanceCriteria ? `\n\nAcceptance Criteria:\n${freshTicket.acceptanceCriteria}` : ""}`;

    console.log(`[agent-complete] Lead finished triage for ${ticketId} (not epic) — dispatching researcher + designer`);

    fireDispatch("http://localhost:3000", ticketId, {
      commentContent: `Lead has reviewed this ticket. Research it now.\n\n${ticketSummary}`,
    }, "lead-triage/research");

    fireDispatch("http://localhost:3000", ticketId, {
      commentContent: `Lead has reviewed this ticket. Review the UI/UX implications and propose design direction.\n\n${ticketSummary}`,
      targetRole: "designer",
      silent: true,
    }, "lead-triage/designer");
  }

  // ── Mark agent run completed ────────────────────────────
  if (personaId) {
    await completeAgentRun(ticketId, personaId, "completed");
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

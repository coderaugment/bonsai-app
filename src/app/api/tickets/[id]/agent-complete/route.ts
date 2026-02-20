import { NextResponse } from "next/server";
import { getTicketById } from "@/db/data/tickets";
import { createCommentAndBumpCount } from "@/db/data/comments";
import { createAgentProjectMessage } from "@/db/data/project-messages";
import { getPersonaRaw, getProjectPersonasRaw } from "@/db/data/personas";
import { logAuditEvent } from "@/db/data/audit";
import { completeAgentRun } from "@/db/data/agent-runs";
import { getSetting } from "@/db/data/settings";
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

  // ── Inbox ticket → write to project_messages instead ───
  const isInbox = ticket.title === "[Inbox]";
  if (isInbox && ticket.projectId) {
    await createAgentProjectMessage(ticket.projectId, personaId, trimmed);

    // DISABLED: @mention chaining causes infinite loops and wastes API credits
    // Support @mention chaining in agent response
    // const projectPersonas = await getProjectPersonasRaw(ticket.projectId);
    // const sorted = [...projectPersonas].sort((a, b) => b.name.length - a.name.length);
    // for (const p of sorted) {
    //   if (p.id === personaId) continue;
    //   const escapedName = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    //   const escapedRole = p.role ? p.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
    //   const namePattern = new RegExp(`@${escapedName}\\b`, 'i');
    //   const rolePattern = escapedRole ? new RegExp(`@${escapedRole}\\b`, 'i') : null;
    //   if (namePattern.test(trimmed) || (rolePattern && rolePattern.test(trimmed))) {
    //     console.log(`[agent-complete/inbox] Agent ${personaId} mentioned @${p.name} — dispatching`);
    //     fireDispatch("http://localhost:3080", ticketId, {
    //       commentContent: trimmed,
    //       targetPersonaId: p.id,
    //       conversational: true,
    //     }, `agent-complete/inbox/@${p.name}`);
    //   }
    // }

    if (personaId) {
      await completeAgentRun(ticketId, personaId, "completed");
    }

    await logAuditEvent({
      ticketId,
      event: "agent_completed",
      actorType: "agent",
      actorId: personaId,
      actorName: agentName,
      detail: `${agentName} completed project chat response`,
      metadata: { role: completingPersona?.role || "unknown", inbox: true },
    });

    return NextResponse.json({ ok: true });
  }

  // ── Post chat comment (normal ticket flow) ─────────────
  await createCommentAndBumpCount({
    ticketId,
    authorType: "agent",
    personaId: personaId || null,
    content: trimmed,
    documentId: documentId || null,
  });

  // DISABLED: @mention chaining causes infinite loops and wastes API credits
  // ── Agent @mention dispatch ────────────────────────────
  // Fetch fresh ticket state for phase-gating BEFORE processing mentions
  const freshTicket = await getTicketById(ticketId);

  // const projectPersonas = ticket.projectId
  //   ? await getProjectPersonasRaw(ticket.projectId)
  //   : [];

  // const sorted = [...projectPersonas].sort((a, b) => b.name.length - a.name.length);
  const mentioned = new Set<string>(); // Keep this for lead triage fallback check

  // for (const p of sorted) {
  //   if (p.id === personaId) continue;
  //   const escapedName = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  //   const escapedRole = p.role ? p.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  //   const namePattern = new RegExp(`@${escapedName}\\b`, 'i');
  //   const rolePattern = escapedRole ? new RegExp(`@${escapedRole}\\b`, 'i') : null;
  //   if ((namePattern.test(trimmed) || (rolePattern && rolePattern.test(trimmed))) && !mentioned.has(p.id)) {
  //     mentioned.add(p.id);
  //     console.log(`[agent-complete] Agent ${personaId} mentioned @${p.name} — dispatching`);
  //     fireDispatch("http://localhost:3080", ticketId, {
  //       commentContent: trimmed,
  //       targetPersonaId: p.id,
  //       conversational: true,
  //     }, `agent-complete/@${p.name}`);
  //   }
  // }

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

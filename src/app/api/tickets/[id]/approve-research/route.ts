import { NextResponse } from "next/server";
import { getSetting } from "@/db/data/settings";
import { getTicketById, updateTicket } from "@/db/data/tickets";
import { createSystemCommentAndBumpCount } from "@/db/data/comments";
import { getPersonasByRole } from "@/db/data/personas";
import { logAuditEvent } from "@/db/data/audit";
import { fireDispatch } from "@/lib/dispatch-agent";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/tickets/[id]/approve-research - Human approves research document
export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);

  // Check that ticket has research completed
  const ticket = await getTicketById(ticketId);

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (!ticket.researchCompletedAt) {
    return NextResponse.json(
      { error: "Research has not been completed yet" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const userName = await getSetting("user_name");

  await updateTicket(ticketId, {
    researchApprovedAt: now,
    state: "planning",
  });

  // Post system comment for the transition
  await createSystemCommentAndBumpCount(
    ticketId,
    `Research approved — continuing planning phase`
  );

  const origin = new URL(req.url).origin;

  // Auto-dispatch developer to start implementation planning
  fireDispatch(origin, ticketId, {
    commentContent: "Research has been approved. Create the implementation plan now.",
    targetRole: "developer",
  }, "approve-research");

  // Auto-dispatch designer if the project has one — generate mockups in parallel with planning
  if (ticket.projectId) {
    const designers = await getPersonasByRole("designer", { projectId: ticket.projectId });
    if (designers.length > 0) {
      fireDispatch(origin, ticketId, {
        commentContent: "Research has been approved. Generate UI mockups for this ticket based on the description and research findings. Use nano-banana to create the images and attach them to the ticket.",
        targetPersonaId: designers[0].id,
      }, "approve-research/designer");
    }
  }

  await logAuditEvent({
    ticketId,
    event: "research_approved",
    actorType: "human",
    actorId: null,
    actorName: userName ?? "User",
    detail: "Approved research document",
    metadata: { newState: "plan" },
  });

  return NextResponse.json({
    ok: true,
    approvedAt: now,
    state: "planning",
  });
}

// DELETE /api/tickets/[id]/approve-research - Revoke research approval
export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);

  await updateTicket(ticketId, {
    researchApprovedAt: null,
  });

  const userName = await getSetting("user_name");
  await logAuditEvent({
    ticketId,
    event: "research_approval_revoked",
    actorType: "human",
    actorId: null,
    actorName: userName ?? "User",
    detail: "Revoked research approval",
  });

  return NextResponse.json({ ok: true });
}

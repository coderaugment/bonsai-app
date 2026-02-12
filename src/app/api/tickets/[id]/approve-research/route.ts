import { NextResponse } from "next/server";
import { getUser } from "@/db/data/users";
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
  const { id: ticketId } = await context.params;

  // Get current user (first user for now - in production would use auth)
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "No user found" }, { status: 401 });
  }

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

  await updateTicket(ticketId, {
    researchApprovedAt: now,
    researchApprovedBy: user.id,
    state: "plan",
  });

  // Post system comment for the transition
  await createSystemCommentAndBumpCount(
    ticketId,
    `Moved from **research** to **plan** — research approved`
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
    actorId: user.id,
    actorName: user.name,
    detail: "Approved research document",
    metadata: { newState: "plan" },
  });

  return NextResponse.json({
    ok: true,
    approvedAt: now,
    approvedBy: user.id,
    state: "plan",
  });
}

// DELETE /api/tickets/[id]/approve-research - Revoke research approval
export async function DELETE(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;

  await updateTicket(ticketId, {
    researchApprovedAt: null,
    researchApprovedBy: null,
  });

  const user = await getUser();
  await logAuditEvent({
    ticketId,
    event: "research_approval_revoked",
    actorType: "human",
    actorId: user?.id,
    actorName: user?.name ?? "Unknown",
    detail: "Revoked research approval",
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getUser } from "@/db/data/users";
import { getTicketById, updateTicket } from "@/db/data/tickets";
import { createSystemCommentAndBumpCount } from "@/db/data/comments";
import { logAuditEvent } from "@/db/data/audit";
import { fireDispatch } from "@/lib/dispatch-agent";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/tickets/[id]/approve-plan - Human approves implementation plan
export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);

  // Get current user (first user for now - in production would use auth)
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "No user found" }, { status: 401 });
  }

  // Check that ticket has plan completed
  const ticket = await getTicketById(ticketId);

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (!ticket.planCompletedAt) {
    return NextResponse.json(
      { error: "Implementation plan has not been completed yet" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  await updateTicket(ticketId, {
    planApprovedAt: now,
    planApprovedBy: user.id,
    state: "build",
  });

  // Post system comment for the transition
  await createSystemCommentAndBumpCount(
    ticketId,
    `Moved from **plan** to **build** — plan approved`
  );

  // Auto-dispatch developer to start implementation
  const origin = new URL(req.url).origin;
  fireDispatch(origin, ticketId, {
    commentContent: "The implementation plan has been approved. Begin coding the implementation now. Follow the plan step by step.",
    targetRole: "developer",
  }, "approve-plan");

  await logAuditEvent({
    ticketId,
    event: "plan_approved",
    actorType: "human",
    actorId: user.id,
    actorName: user.name,
    detail: "Approved implementation plan",
    metadata: { newState: "build" },
  });

  return NextResponse.json({
    ok: true,
    approvedAt: now,
    approvedBy: user.id,
    state: "build",
  });
}

// DELETE /api/tickets/[id]/approve-plan - Revoke plan approval
export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);

  await updateTicket(ticketId, {
    planApprovedAt: null,
    planApprovedBy: null,
  });

  const user = await getUser();
  await logAuditEvent({
    ticketId,
    event: "plan_approval_revoked",
    actorType: "human",
    actorId: user?.id,
    actorName: user?.name ?? "Unknown",
    detail: "Revoked plan approval",
  });

  return NextResponse.json({ ok: true });
}

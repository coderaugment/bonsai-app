import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, users, comments } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { logAuditEvent } from "@/db/queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/tickets/[id]/approve-plan - Human approves implementation plan
export async function POST(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;

  // Get current user (first user for now - in production would use auth)
  const user = db.select().from(users).limit(1).get();
  if (!user) {
    return NextResponse.json({ error: "No user found" }, { status: 401 });
  }

  // Check that ticket has plan completed
  const ticket = db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();

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

  db.update(tickets)
    .set({
      planApprovedAt: now,
      planApprovedBy: user.id,
      state: "build",
    })
    .where(eq(tickets.id, ticketId))
    .run();

  // Post system comment for the transition
  db.insert(comments)
    .values({
      ticketId,
      authorType: "system",
      content: `Moved from **plan** to **build** — plan approved`,
    })
    .run();
  db.update(tickets)
    .set({ commentCount: sql`COALESCE(${tickets.commentCount}, 0) + 1` })
    .where(eq(tickets.id, ticketId))
    .run();

  // Auto-dispatch developer to start implementation
  const origin = new URL(req.url).origin;
  fetch(`${origin}/api/tickets/${ticketId}/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commentContent: "The implementation plan has been approved. Begin coding the implementation now. Follow the plan step by step.",
      targetRole: "developer",
    }),
  }).catch(() => {});

  logAuditEvent({
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
  const { id: ticketId } = await context.params;

  db.update(tickets)
    .set({
      planApprovedAt: null,
      planApprovedBy: null,
    })
    .where(eq(tickets.id, ticketId))
    .run();

  const user = db.select().from(users).limit(1).get();
  logAuditEvent({
    ticketId,
    event: "plan_approval_revoked",
    actorType: "human",
    actorId: user?.id,
    actorName: user?.name ?? "Unknown",
    detail: "Revoked plan approval",
  });

  return NextResponse.json({ ok: true });
}

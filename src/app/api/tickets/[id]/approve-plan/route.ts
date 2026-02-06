import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, users } from "@/db/schema";
import { eq } from "drizzle-orm";

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
    })
    .where(eq(tickets.id, ticketId))
    .run();

  return NextResponse.json({
    ok: true,
    approvedAt: now,
    approvedBy: user.id,
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

  return NextResponse.json({ ok: true });
}

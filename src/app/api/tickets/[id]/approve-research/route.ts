import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, users } from "@/db/schema";
import { eq } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/tickets/[id]/approve-research - Human approves research document
export async function POST(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;

  // Get current user (first user for now - in production would use auth)
  const user = db.select().from(users).limit(1).get();
  if (!user) {
    return NextResponse.json({ error: "No user found" }, { status: 401 });
  }

  // Check that ticket has research completed
  const ticket = db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();

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

  db.update(tickets)
    .set({
      researchApprovedAt: now,
      researchApprovedBy: user.id,
      state: "in_progress",
    })
    .where(eq(tickets.id, ticketId))
    .run();

  return NextResponse.json({
    ok: true,
    approvedAt: now,
    approvedBy: user.id,
    state: "in_progress",
  });
}

// DELETE /api/tickets/[id]/approve-research - Revoke research approval
export async function DELETE(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;

  db.update(tickets)
    .set({
      researchApprovedAt: null,
      researchApprovedBy: null,
    })
    .where(eq(tickets.id, ticketId))
    .run();

  return NextResponse.json({ ok: true });
}

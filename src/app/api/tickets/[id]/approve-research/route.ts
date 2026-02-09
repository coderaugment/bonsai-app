import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, users, comments, personas } from "@/db/schema";
import { eq, sql, and, isNull } from "drizzle-orm";
import { logAuditEvent } from "@/db/queries";

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
      state: "plan",
    })
    .where(eq(tickets.id, ticketId))
    .run();

  // Post system comment for the transition
  db.insert(comments)
    .values({
      ticketId,
      authorType: "system",
      content: `Moved from **research** to **plan** — research approved`,
    })
    .run();
  db.update(tickets)
    .set({ commentCount: sql`COALESCE(${tickets.commentCount}, 0) + 1` })
    .where(eq(tickets.id, ticketId))
    .run();

  // Auto-dispatch developer to start implementation planning
  const origin = new URL(req.url).origin;
  fetch(`${origin}/api/tickets/${ticketId}/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commentContent: "Research has been approved. Create the implementation plan now.",
      targetRole: "developer",
    }),
  }).catch(() => {});

  // Auto-dispatch designer if the project has one — generate mockups in parallel with planning
  if (ticket.projectId) {
    const designer = db.select().from(personas)
      .where(and(
        eq(personas.projectId, ticket.projectId),
        eq(personas.role, "designer"),
        isNull(personas.deletedAt),
      ))
      .get();
    if (designer) {
      fetch(`${origin}/api/tickets/${ticketId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentContent: "Research has been approved. Generate UI mockups for this ticket based on the description and research findings. Use nano-banana to create the images and attach them to the ticket.",
          targetPersonaId: designer.id,
        }),
      }).catch(() => {});
    }
  }

  logAuditEvent({
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

  db.update(tickets)
    .set({
      researchApprovedAt: null,
      researchApprovedBy: null,
    })
    .where(eq(tickets.id, ticketId))
    .run();

  const user = db.select().from(users).limit(1).get();
  logAuditEvent({
    ticketId,
    event: "research_approval_revoked",
    actorType: "human",
    actorId: user?.id,
    actorName: user?.name ?? "Unknown",
    detail: "Revoked research approval",
  });

  return NextResponse.json({ ok: true });
}

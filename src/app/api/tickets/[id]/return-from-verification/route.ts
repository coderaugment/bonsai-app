import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, comments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAuditEvent } from "@/db/queries";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;
  const body = await request.json();
  const { reason, authorType = "human" } = body;

  // Verify ticket exists and is in verification state
  const ticket = db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (ticket.state !== "test") {
    return NextResponse.json(
      { error: "Ticket is not in test state" },
      { status: 400 }
    );
  }

  // Set returned flag and move back to build
  db.update(tickets)
    .set({
      returnedFromVerification: true,
      state: "build",
    })
    .where(eq(tickets.id, ticketId))
    .run();

  // Add a comment with the reason
  if (reason) {
    db.insert(comments)
      .values({
        ticketId,
        authorType,
        authorId: authorType === "human" ? 1 : null, // TODO: Get actual user ID
        personaId: authorType === "agent" ? ticket.assigneeId : null,
        content: `**Returned from verification:** ${reason}`,
        createdAt: new Date().toISOString(),
      })
      .run();

    // Update lastHumanCommentAt if human authored
    if (authorType === "human") {
      db.update(tickets)
        .set({
          lastHumanCommentAt: new Date().toISOString(),
          commentCount: (ticket.commentCount || 0) + 1,
        })
        .where(eq(tickets.id, ticketId))
        .run();
    }
  }

  logAuditEvent({
    ticketId,
    event: "returned_from_verification",
    actorType: authorType === "agent" ? "agent" : "human",
    actorName: authorType === "agent" ? "Agent" : "Human",
    detail: reason ? `Returned from verification: ${reason.slice(0, 200)}` : "Returned from verification",
    metadata: { from: "test", to: "build" },
  });

  return NextResponse.json({ success: true });
}

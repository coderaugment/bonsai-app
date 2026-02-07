import { NextResponse } from "next/server";
import { db } from "@/db";
import { comments, tickets, personas } from "@/db/schema";
import { eq } from "drizzle-orm";

// Called by agents mid-run to post progress updates to the ticket thread.
// Lighter than agent-complete — just posts a comment, no document logic.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;
  const { personaId, content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  // Post agent comment
  db.insert(comments)
    .values({
      ticketId,
      authorType: "agent",
      personaId: personaId || null,
      content: content.trim(),
    })
    .run();

  // Bump comment count + refresh activity timestamp
  db.update(tickets)
    .set({
      commentCount: (ticket.commentCount || 0) + 1,
      lastAgentActivity: new Date().toISOString(),
    })
    .where(eq(tickets.id, ticketId))
    .run();

  return NextResponse.json({ ok: true });
}

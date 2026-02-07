import { NextResponse } from "next/server";
import { db } from "@/db";
import { comments, tickets, personas, ticketDocuments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Called by the agent wrapper script when claude -p finishes.
// Posts the agent's output as a comment and saves documents based on ticket phase.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;
  const { personaId, content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "empty output" }, { status: 400 });
  }

  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  const trimmed = content.trim();
  const now = new Date().toISOString();

  // Determine if agent output is a research doc or plan based on ticket phase
  if (!ticket.researchCompletedAt && trimmed.length > 200) {
    // No research yet — save output as research document
    const existing = db.select().from(ticketDocuments)
      .where(and(eq(ticketDocuments.ticketId, ticketId), eq(ticketDocuments.type, "research")))
      .get();

    if (existing) {
      db.update(ticketDocuments)
        .set({ content: trimmed, version: (existing.version || 0) + 1, updatedAt: now })
        .where(eq(ticketDocuments.id, existing.id))
        .run();
    } else {
      db.insert(ticketDocuments)
        .values({ ticketId, type: "research", content: trimmed, version: 1, createdAt: now, updatedAt: now })
        .run();
    }

    db.update(tickets)
      .set({ researchCompletedAt: now, researchCompletedBy: personaId || null })
      .where(eq(tickets.id, ticketId))
      .run();
  } else if (ticket.researchApprovedAt && !ticket.planCompletedAt && trimmed.length > 200) {
    // Research approved, no plan yet — save as implementation plan
    const existing = db.select().from(ticketDocuments)
      .where(and(eq(ticketDocuments.ticketId, ticketId), eq(ticketDocuments.type, "implementation_plan")))
      .get();

    if (existing) {
      db.update(ticketDocuments)
        .set({ content: trimmed, version: (existing.version || 0) + 1, updatedAt: now })
        .where(eq(ticketDocuments.id, existing.id))
        .run();
    } else {
      db.insert(ticketDocuments)
        .values({ ticketId, type: "implementation_plan", content: trimmed, version: 1, createdAt: now, updatedAt: now })
        .run();
    }

    db.update(tickets)
      .set({ planCompletedAt: now, planCompletedBy: personaId || null })
      .where(eq(tickets.id, ticketId))
      .run();
  }

  // Post agent comment (summary, not full doc)
  const summary = trimmed.length > 500
    ? trimmed.slice(0, 500).replace(/\n+/g, " ").trim() + "..."
    : trimmed;
  db.insert(comments)
    .values({
      ticketId,
      authorType: "agent",
      personaId: personaId || null,
      content: summary,
    })
    .run();

  // Bump comment count
  db.update(tickets)
    .set({ commentCount: (ticket.commentCount || 0) + 1 })
    .where(eq(tickets.id, ticketId))
    .run();

  return NextResponse.json({ ok: true });
}

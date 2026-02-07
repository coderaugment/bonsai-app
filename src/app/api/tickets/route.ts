import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, users, comments, ticketDocuments } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getTickets } from "@/db/queries";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const result = getTickets(projectId ? Number(projectId) : undefined);
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const { ticketId, state } = await req.json();
  if (!ticketId || !state) {
    return NextResponse.json({ error: "ticketId and state required" }, { status: 400 });
  }
  db.update(tickets).set({ state }).where(eq(tickets.id, ticketId)).run();
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const { ticketId, title, description, acceptanceCriteria, type, state } = await req.json();
  if (!ticketId) {
    return NextResponse.json({ error: "ticketId required" }, { status: 400 });
  }
  db.update(tickets)
    .set({
      title: title?.trim() || undefined,
      description: description?.trim() || null,
      acceptanceCriteria: acceptanceCriteria?.trim() || null,
      type: type || undefined,
      state: state || undefined,
    })
    .where(eq(tickets.id, ticketId))
    .run();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { ticketId } = await req.json();
  if (!ticketId) {
    return NextResponse.json({ error: "ticketId required" }, { status: 400 });
  }
  // Delete comments and documents first, then the ticket
  db.delete(comments).where(eq(comments.ticketId, ticketId)).run();
  db.delete(ticketDocuments).where(eq(ticketDocuments.ticketId, ticketId)).run();
  db.delete(tickets).where(eq(tickets.id, ticketId)).run();
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const { title, type, description, acceptanceCriteria, projectId } =
    await req.json();

  // Get current user as creator
  const user = db.select().from(users).limit(1).get();

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // Generate next ticket ID
  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .get();
  const num = (countRow?.count ?? 0) + 1;
  const id = `tkt_${String(num).padStart(2, "0")}`;

  const ticket = db
    .insert(tickets)
    .values({
      id,
      title: title.trim(),
      type: type || "feature",
      state: "plan",
      description: description?.trim() || null,
      acceptanceCriteria: acceptanceCriteria?.trim() || null,
      priority: 500,
      projectId: projectId || 1,
      createdBy: user?.id ?? null,
      commentCount: 0,
      hasAttachments: false,
    })
    .returning()
    .get();

  // Auto-dispatch research agent (fire-and-forget)
  try {
    const origin = new URL(req.url).origin;
    fetch(`${origin}/api/tickets/${id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commentContent: `New ticket created. Research this ticket.\n\n${title.trim()}${description ? `\n\n${description.trim()}` : ""}${acceptanceCriteria ? `\n\nAcceptance Criteria:\n${acceptanceCriteria.trim()}` : ""}`,
      }),
    }).catch(() => {}); // fire-and-forget, don't block ticket creation
  } catch {
    // dispatch failure shouldn't block ticket creation
  }

  return NextResponse.json({ success: true, ticket });
}

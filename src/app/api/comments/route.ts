import { NextResponse } from "next/server";
import { db } from "@/db";
import { comments, users, personas, tickets } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticketId = searchParams.get("ticketId");

  if (!ticketId) {
    return NextResponse.json({ error: "ticketId required" }, { status: 400 });
  }

  const rows = db
    .select()
    .from(comments)
    .where(eq(comments.ticketId, ticketId))
    .orderBy(asc(comments.createdAt))
    .all();

  // Enrich with author info
  const enriched = rows.map((row) => {
    let author: { name: string; avatarUrl?: string; color?: string; role?: string } | undefined;

    if (row.authorType === "human" && row.authorId) {
      const user = db.select().from(users).where(eq(users.id, row.authorId)).get();
      if (user) {
        author = { name: user.name, avatarUrl: user.avatarUrl || undefined };
      }
    } else if (row.authorType === "agent" && row.personaId) {
      const persona = db.select().from(personas).where(eq(personas.id, row.personaId)).get();
      if (persona) {
        author = { name: persona.name, avatarUrl: persona.avatar || undefined, color: persona.color, role: persona.role || undefined };
      }
    }

    // Parse attachments JSON
    let attachments;
    try {
      attachments = row.attachments ? JSON.parse(row.attachments) : undefined;
    } catch {
      attachments = undefined;
    }

    return {
      id: row.id,
      ticketId: row.ticketId,
      authorType: row.authorType,
      author,
      content: row.content,
      attachments,
      createdAt: row.createdAt,
    };
  });

  return NextResponse.json({ comments: enriched });
}

export async function POST(req: Request) {
  const { ticketId, content, attachments } = await req.json();

  if (!ticketId || (!content?.trim() && (!attachments || attachments.length === 0))) {
    return NextResponse.json({ error: "ticketId and content or attachments required" }, { status: 400 });
  }

  // Get current user
  const user = db.select().from(users).limit(1).get();

  const comment = db
    .insert(comments)
    .values({
      ticketId,
      authorType: "human",
      authorId: user?.id ?? null,
      content: content?.trim() || "",
      attachments: attachments ? JSON.stringify(attachments) : null,
    })
    .returning()
    .get();

  // Update comment count and lastHumanCommentAt on ticket
  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (ticket) {
    db.update(tickets)
      .set({
        commentCount: (ticket.commentCount || 0) + 1,
        lastHumanCommentAt: new Date().toISOString()
      })
      .where(eq(tickets.id, ticketId))
      .run();
  }

  return NextResponse.json({
    success: true,
    comment: {
      id: comment.id,
      ticketId: comment.ticketId,
      authorType: comment.authorType,
      author: user ? { name: user.name, avatarUrl: user.avatarUrl || undefined } : undefined,
      content: comment.content,
      attachments,
      createdAt: comment.createdAt,
    },
  });
}

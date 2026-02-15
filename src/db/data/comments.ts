import { db, asAsync, runAsync } from "./_driver";
import { comments, tickets, users, personas } from "../schema";
import { eq, and, isNull, asc, desc } from "drizzle-orm";

export function getCommentsByTicket(ticketId: number, limit: number = 10) {
  const rows = db
    .select()
    .from(comments)
    .where(and(eq(comments.ticketId, ticketId), isNull(comments.documentId)))
    .orderBy(desc(comments.createdAt))
    .limit(limit)
    .all();
  return asAsync(rows);
}

/** Get comments filtered by ticketId and optionally by documentId */
export function getCommentsByTicketOrDocument(
  ticketId: number,
  documentId?: number | null
) {
  const whereClause = documentId
    ? and(
        eq(comments.ticketId, ticketId),
        eq(comments.documentId, documentId)
      )
    : and(eq(comments.ticketId, ticketId), isNull(comments.documentId));

  const rows = db
    .select()
    .from(comments)
    .where(whereClause)
    .orderBy(asc(comments.createdAt))
    .all();
  return asAsync(rows);
}

/** Enrich comment rows with author info (user/persona lookup) */
export function enrichComments(
  rows: (typeof comments.$inferSelect)[]
) {
  const enriched = rows.map((row) => {
    let author:
      | { name: string; avatarUrl?: string; color?: string; role?: string }
      | undefined;

    if (row.authorType === "human" && row.authorId) {
      const user = db
        .select()
        .from(users)
        .where(eq(users.id, row.authorId))
        .get();
      if (user) {
        author = { name: user.name, avatarUrl: user.avatarUrl || undefined };
      }
    } else if (row.authorType === "agent" && row.personaId) {
      const persona = db
        .select()
        .from(personas)
        .where(eq(personas.id, row.personaId))
        .get();
      if (persona) {
        author = {
          name: persona.name,
          avatarUrl: persona.avatar || undefined,
          color: persona.color,
          role: persona.role || undefined,
        };
      }
    }

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
      documentId: row.documentId ?? undefined,
      createdAt: row.createdAt,
    };
  });
  return asAsync(enriched);
}

export function createComment(data: {
  ticketId: number;
  authorType: "human" | "agent" | "system";
  authorId?: number | null;
  personaId?: string | null;
  content: string;
  attachments?: string | null;
  documentId?: number | null;
  createdAt?: string;
}) {
  const row = db
    .insert(comments)
    .values({
      ticketId: data.ticketId,
      authorType: data.authorType,
      authorId: data.authorId ?? null,
      personaId: data.personaId ?? null,
      content: data.content,
      attachments: data.attachments ?? null,
      documentId: data.documentId ?? null,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    })
    .returning()
    .get();
  return asAsync(row);
}

/**
 * Insert a comment and bump the ticket's commentCount in one operation.
 * Optionally updates lastHumanCommentAt for human comments.
 */
export function createCommentAndBumpCount(data: {
  ticketId: number;
  authorType: "human" | "agent" | "system";
  authorId?: number | null;
  personaId?: string | null;
  content: string;
  attachments?: string | null;
  documentId?: number | null;
  bumpHumanCommentAt?: boolean;
}) {
  const row = db
    .insert(comments)
    .values({
      ticketId: data.ticketId,
      authorType: data.authorType,
      authorId: data.authorId ?? null,
      personaId: data.personaId ?? null,
      content: data.content,
      attachments: data.attachments ?? null,
      documentId: data.documentId ?? null,
    })
    .returning()
    .get();

  const ticket = db
    .select()
    .from(tickets)
    .where(eq(tickets.id, data.ticketId))
    .get();
  if (ticket) {
    const updates: Record<string, unknown> = {
      commentCount: (ticket.commentCount || 0) + 1,
    };
    if (data.bumpHumanCommentAt) {
      updates.lastHumanCommentAt = new Date().toISOString();
    }
    db.update(tickets)
      .set(updates)
      .where(eq(tickets.id, data.ticketId))
      .run();
  }

  return asAsync(row);
}

/** Post an agent comment and bump count (used by dispatch) */
export function createAgentComment(
  ticketId: number,
  personaId: string,
  content: string
): Promise<void> {
  return runAsync(() => {
    db.insert(comments)
      .values({ ticketId, authorType: "agent", personaId, content })
      .run();
    const ticket = db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .get();
    if (ticket) {
      db.update(tickets)
        .set({ commentCount: (ticket.commentCount || 0) + 1 })
        .where(eq(tickets.id, ticketId))
        .run();
    }
  });
}

/** Post a system comment and bump count (used by state transitions) */
export function createSystemCommentAndBumpCount(
  ticketId: number,
  content: string
): Promise<void> {
  return runAsync(() => {
    db.insert(comments)
      .values({ ticketId, authorType: "system", content })
      .run();
    const ticket = db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .get();
    if (ticket) {
      db.update(tickets)
        .set({ commentCount: (ticket.commentCount || 0) + 1 })
        .where(eq(tickets.id, ticketId))
        .run();
    }
  });
}

/** Get recent comments with persona enrichment (used by dispatch context) */
export function getRecentCommentsEnriched(ticketId: number, limit = 10) {
  const recentComments = db
    .select()
    .from(comments)
    .where(eq(comments.ticketId, ticketId))
    .orderBy(desc(comments.createdAt))
    .limit(limit)
    .all()
    .reverse();

  const enriched = recentComments.map((c) => {
    let authorName = "Unknown";
    if (c.authorType === "agent" && c.personaId) {
      const p = db
        .select()
        .from(personas)
        .where(eq(personas.id, c.personaId))
        .get();
      if (p) authorName = `${p.name} (${p.role})`;
    } else {
      authorName = "Human";
    }
    return `**${authorName}** [${c.authorType}]:\n${c.content}`;
  });
  return asAsync(enriched);
}

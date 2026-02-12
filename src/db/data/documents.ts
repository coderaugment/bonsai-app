import { db, asAsync, runAsync } from "./_driver";
import { ticketDocuments } from "../schema";
import { eq, and, desc, sql } from "drizzle-orm";

type DocType =
  | "research"
  | "implementation_plan"
  | "research_critique"
  | "plan_critique"
  | "design";

export function getDocumentsByTicket(ticketId: string) {
  const rows = db
    .select()
    .from(ticketDocuments)
    .where(eq(ticketDocuments.ticketId, ticketId))
    .orderBy(desc(ticketDocuments.updatedAt))
    .all();
  return asAsync(rows);
}

export function getDocumentByType(ticketId: string, type: DocType) {
  const row = db
    .select()
    .from(ticketDocuments)
    .where(
      and(
        eq(ticketDocuments.ticketId, ticketId),
        eq(ticketDocuments.type, type)
      )
    )
    .get();
  return asAsync(row ?? null);
}

export function getLatestDocumentVersion(
  ticketId: string,
  type: DocType
): Promise<number> {
  const row = db
    .select({
      maxVersion: sql<number>`COALESCE(MAX(${ticketDocuments.version}), 0)`,
    })
    .from(ticketDocuments)
    .where(
      and(
        eq(ticketDocuments.ticketId, ticketId),
        eq(ticketDocuments.type, type)
      )
    )
    .get();
  return asAsync(row?.maxVersion ?? 0);
}

export function createDocument(data: {
  ticketId: string;
  type: DocType;
  content: string;
  version: number;
  authorPersonaId?: string | null;
}) {
  const now = new Date().toISOString();
  const row = db
    .insert(ticketDocuments)
    .values({
      ticketId: data.ticketId,
      type: data.type,
      content: data.content,
      version: data.version,
      authorPersonaId: data.authorPersonaId || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return asAsync(row);
}

export function updateDocument(
  id: number,
  data: { content: string; version: number }
): Promise<void> {
  return runAsync(() => {
    db.update(ticketDocuments)
      .set({
        content: data.content,
        version: data.version,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(ticketDocuments.id, id))
      .run();
  });
}

export function deleteDocumentsByType(
  ticketId: string,
  type: DocType
): Promise<void> {
  return runAsync(() => {
    db.delete(ticketDocuments)
      .where(
        and(
          eq(ticketDocuments.ticketId, ticketId),
          eq(ticketDocuments.type, type)
        )
      )
      .run();
  });
}

/** Get the latest document for a ticket by type (highest version) */
export function getLatestDocumentByType(ticketId: string, type: DocType) {
  const row = db
    .select()
    .from(ticketDocuments)
    .where(
      and(
        eq(ticketDocuments.ticketId, ticketId),
        eq(ticketDocuments.type, type)
      )
    )
    .orderBy(desc(ticketDocuments.version))
    .limit(1)
    .get();
  return asAsync(row ?? null);
}

/** Get documents for a ticket ordered by version desc (used in queries.ts compat) */
export function getDocumentsByTicketVersionDesc(ticketId: string) {
  const rows = db
    .select()
    .from(ticketDocuments)
    .where(eq(ticketDocuments.ticketId, ticketId))
    .orderBy(desc(ticketDocuments.version))
    .all();
  return asAsync(rows);
}

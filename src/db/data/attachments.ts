import { db, asAsync, runAsync } from "./_driver";
import { ticketAttachments } from "../schema";
import { eq } from "drizzle-orm";

export function getAttachmentsByTicket(ticketId: string) {
  const rows = db
    .select()
    .from(ticketAttachments)
    .where(eq(ticketAttachments.ticketId, ticketId))
    .all();
  return asAsync(rows);
}

export function getAttachment(id: number) {
  const row = db
    .select()
    .from(ticketAttachments)
    .where(eq(ticketAttachments.id, id))
    .get();
  return asAsync(row ?? null);
}

export function createAttachment(data: {
  ticketId: string;
  filename: string;
  mimeType: string;
  data: string;
  createdByType: "human" | "agent";
  createdById?: string | null;
}) {
  const row = db
    .insert(ticketAttachments)
    .values({
      ticketId: data.ticketId,
      filename: data.filename,
      mimeType: data.mimeType,
      data: data.data,
      createdByType: data.createdByType,
      createdById: data.createdById || null,
    })
    .returning()
    .get();
  return asAsync(row);
}

export function deleteAttachment(id: number): Promise<void> {
  return runAsync(() => {
    db.delete(ticketAttachments).where(eq(ticketAttachments.id, id)).run();
  });
}

export function updateAttachmentData(
  id: number,
  data: { data: string; mimeType: string }
): Promise<void> {
  return runAsync(() => {
    db.update(ticketAttachments)
      .set({ data: data.data, mimeType: data.mimeType })
      .where(eq(ticketAttachments.id, id))
      .run();
  });
}

import { db, asAsync, runAsync } from "./_driver";
import { ticketAuditLog } from "../schema";
import { eq, asc } from "drizzle-orm";

export function logAuditEvent(params: {
  ticketId: number;
  event: string;
  actorType: "human" | "agent" | "system";
  actorId?: string | number | null;
  actorName: string;
  detail: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return runAsync(() => {
    db.insert(ticketAuditLog)
      .values({
        ticketId: params.ticketId,
        event: params.event,
        actorType: params.actorType,
        actorId: params.actorId != null ? String(params.actorId) : null,
        actorName: params.actorName,
        detail: params.detail,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      })
      .run();
  });
}

export function getAuditLog(ticketId: number) {
  const rows = db
    .select()
    .from(ticketAuditLog)
    .where(eq(ticketAuditLog.ticketId, ticketId))
    .orderBy(asc(ticketAuditLog.createdAt))
    .all();
  return asAsync(rows);
}

export function clearAuditLog(ticketId: number): Promise<void> {
  return runAsync(() => {
    db.delete(ticketAuditLog).where(eq(ticketAuditLog.ticketId, ticketId)).run();
  });
}

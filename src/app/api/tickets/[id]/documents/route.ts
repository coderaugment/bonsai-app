import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticketDocuments, tickets, personas } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { logAuditEvent } from "@/db/queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tickets/[id]/documents - List documents for a ticket
export async function GET(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;

  const docs = db
    .select()
    .from(ticketDocuments)
    .where(eq(ticketDocuments.ticketId, ticketId))
    .orderBy(desc(ticketDocuments.updatedAt))
    .all();

  return NextResponse.json({ documents: docs });
}

// POST /api/tickets/[id]/documents - Insert a new version of a document
export async function POST(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;
  const { type: typeParam, content, personaId } = await req.json();

  if (!typeParam || !["research", "implementation_plan"].includes(typeParam)) {
    return NextResponse.json(
      { error: "Invalid document type" },
      { status: 400 }
    );
  }

  const type = typeParam as "research" | "implementation_plan";

  if (!content?.trim()) {
    return NextResponse.json(
      { error: "Content is required" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // Get current max version for this (ticketId, type) pair
  const maxRow = db
    .select({ maxVersion: sql<number>`COALESCE(MAX(${ticketDocuments.version}), 0)` })
    .from(ticketDocuments)
    .where(
      and(
        eq(ticketDocuments.ticketId, ticketId),
        eq(ticketDocuments.type, type)
      )
    )
    .get();

  const nextVersion = (maxRow?.maxVersion ?? 0) + 1;

  // Always INSERT a new version row (append-only)
  const doc = db
    .insert(ticketDocuments)
    .values({
      ticketId,
      type,
      content: content.trim(),
      version: nextVersion,
      authorPersonaId: personaId || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Update ticket tracking columns based on version
  if (type === "research" && personaId) {
    if (nextVersion >= 3) {
      // v3 = final revision, mark research as completed
      db.update(tickets)
        .set({
          researchCompletedAt: now,
          researchCompletedBy: personaId,
        })
        .where(eq(tickets.id, ticketId))
        .run();
    }
    // v1 and v2: do NOT set researchCompletedAt — workflow still in progress
  } else if (type === "implementation_plan" && personaId) {
    db.update(tickets)
      .set({
        planCompletedAt: now,
        planCompletedBy: personaId,
      })
      .where(eq(tickets.id, ticketId))
      .run();
  }

  const authorPersona = personaId
    ? db.select().from(personas).where(eq(personas.id, personaId)).get()
    : null;
  logAuditEvent({
    ticketId,
    event: "document_created",
    actorType: personaId ? "agent" : "human",
    actorId: personaId,
    actorName: authorPersona?.name ?? "Unknown",
    detail: `Created ${type === "research" ? "research document" : "implementation plan"} v${nextVersion}`,
    metadata: { docType: type, version: nextVersion },
  });

  return NextResponse.json({ document: doc, created: true, version: nextVersion });
}

// DELETE /api/tickets/[id]/documents?type=research - Delete a document
export async function DELETE(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;
  const { searchParams } = new URL(req.url);
  const typeParam = searchParams.get("type");

  if (!typeParam || !["research", "implementation_plan"].includes(typeParam)) {
    return NextResponse.json(
      { error: "Invalid document type" },
      { status: 400 }
    );
  }

  const type = typeParam as "research" | "implementation_plan";

  db.delete(ticketDocuments)
    .where(
      and(
        eq(ticketDocuments.ticketId, ticketId),
        eq(ticketDocuments.type, type)
      )
    )
    .run();

  logAuditEvent({
    ticketId,
    event: "document_deleted",
    actorType: "human",
    actorName: "System",
    detail: `Deleted ${type === "research" ? "research document" : "implementation plan"}`,
    metadata: { docType: type },
  });

  // Clear tracking columns + agent activity guard so heartbeat re-dispatches immediately
  if (type === "research") {
    db.update(tickets)
      .set({
        researchCompletedAt: null,
        researchCompletedBy: null,
        researchApprovedAt: null,
        researchApprovedBy: null,
        lastAgentActivity: null,
        assigneeId: null,
      })
      .where(eq(tickets.id, ticketId))
      .run();
  } else {
    db.update(tickets)
      .set({
        planCompletedAt: null,
        planCompletedBy: null,
        planApprovedAt: null,
        planApprovedBy: null,
        lastAgentActivity: null,
        assigneeId: null,
      })
      .where(eq(tickets.id, ticketId))
      .run();
  }

  return NextResponse.json({ ok: true });
}

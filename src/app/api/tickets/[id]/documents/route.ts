import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticketDocuments, tickets, personas } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

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

// POST /api/tickets/[id]/documents - Create or update a document
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

  // Check if document of this type already exists
  const existing = db
    .select()
    .from(ticketDocuments)
    .where(
      and(
        eq(ticketDocuments.ticketId, ticketId),
        eq(ticketDocuments.type, type)
      )
    )
    .get();

  const now = new Date().toISOString();

  if (existing) {
    // Update existing document, increment version
    db.update(ticketDocuments)
      .set({
        content: content.trim(),
        version: existing.version! + 1,
        updatedAt: now,
      })
      .where(eq(ticketDocuments.id, existing.id))
      .run();

    const updated = db
      .select()
      .from(ticketDocuments)
      .where(eq(ticketDocuments.id, existing.id))
      .get();

    // Update ticket tracking columns
    if (type === "research" && personaId) {
      db.update(tickets)
        .set({
          researchCompletedAt: now,
          researchCompletedBy: personaId,
          // Clear approval since content changed
          researchApprovedAt: null,
          researchApprovedBy: null,
        })
        .where(eq(tickets.id, ticketId))
        .run();
    } else if (type === "implementation_plan" && personaId) {
      db.update(tickets)
        .set({
          planCompletedAt: now,
          planCompletedBy: personaId,
          // Clear approval since content changed
          planApprovedAt: null,
          planApprovedBy: null,
        })
        .where(eq(tickets.id, ticketId))
        .run();
    }

    return NextResponse.json({ document: updated, updated: true });
  }

  // Create new document
  const doc = db
    .insert(ticketDocuments)
    .values({
      ticketId,
      type,
      content: content.trim(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Update ticket tracking columns
  if (type === "research" && personaId) {
    db.update(tickets)
      .set({
        researchCompletedAt: now,
        researchCompletedBy: personaId,
      })
      .where(eq(tickets.id, ticketId))
      .run();
  } else if (type === "implementation_plan" && personaId) {
    db.update(tickets)
      .set({
        planCompletedAt: now,
        planCompletedBy: personaId,
      })
      .where(eq(tickets.id, ticketId))
      .run();
  }

  return NextResponse.json({ document: doc, created: true });
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

  // Clear tracking columns
  if (type === "research") {
    db.update(tickets)
      .set({
        researchCompletedAt: null,
        researchCompletedBy: null,
        researchApprovedAt: null,
        researchApprovedBy: null,
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
      })
      .where(eq(tickets.id, ticketId))
      .run();
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { db } from "@/db";
import { comments, tickets, personas, ticketDocuments } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logAuditEvent } from "@/db/queries";

// Called by the agent wrapper script when claude -p finishes.
// Posts the agent's output as a comment and saves documents based on ticket phase.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;
  const { personaId, content, conversational, documentId } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "empty output" }, { status: 400 });
  }

  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  const trimmed = content.trim();
  const now = new Date().toISOString();

  // Look up the completing persona's role
  const completingPersona = personaId
    ? db.select().from(personas).where(eq(personas.id, personaId)).get()
    : null;
  const completingRole = completingPersona?.role || "unknown";
  let savedDocType: "research" | "implementation_plan" | "design" | null = null;
  let savedVersion = 0;

  // ── Research phase: versioned workflow (v1→v2→v3) ──────
  // Skip document saving for conversational replies (e.g. document comment responses)
  // Cap at 3 versions — anything beyond v3 is treated as a chat comment
  const researchMaxRow = !conversational && !ticket.researchApprovedAt ? db
    .select({ maxVersion: sql<number>`COALESCE(MAX(${ticketDocuments.version}), 0)` })
    .from(ticketDocuments)
    .where(
      and(
        eq(ticketDocuments.ticketId, ticketId),
        eq(ticketDocuments.type, "research")
      )
    )
    .get() : null;
  const currentResearchMax = researchMaxRow?.maxVersion ?? 0;

  const isResearchRole = completingRole === "researcher" || completingRole === "critic";
  if (!conversational && isResearchRole && !ticket.researchApprovedAt && trimmed.length > 200 && currentResearchMax < 3) {
    const nextVersion = currentResearchMax + 1;

    // Insert new version row
    db.insert(ticketDocuments)
      .values({
        ticketId,
        type: "research",
        content: trimmed,
        version: nextVersion,
        authorPersonaId: personaId || null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    savedDocType = "research";
    savedVersion = nextVersion;

    // Only mark research completed after v3
    if (nextVersion >= 3 && !ticket.researchCompletedAt) {
      db.update(tickets)
        .set({ researchCompletedAt: now, researchCompletedBy: personaId || null })
        .where(eq(tickets.id, ticketId))
        .run();
    }
  } else if (!conversational && completingRole === "designer" && trimmed.length > 200) {
    // Designer output → save as design doc (separate from research pipeline)
    const existingDesign = db.select().from(ticketDocuments)
      .where(and(eq(ticketDocuments.ticketId, ticketId), eq(ticketDocuments.type, "design")))
      .get();

    if (existingDesign) {
      db.update(ticketDocuments)
        .set({ content: trimmed, version: (existingDesign.version || 0) + 1, updatedAt: now })
        .where(eq(ticketDocuments.id, existingDesign.id))
        .run();
      savedVersion = (existingDesign.version || 0) + 1;
    } else {
      db.insert(ticketDocuments)
        .values({ ticketId, type: "design", content: trimmed, version: 1, authorPersonaId: personaId || null, createdAt: now, updatedAt: now })
        .run();
      savedVersion = 1;
    }
    savedDocType = "design";
  } else if (!conversational && ticket.researchApprovedAt && !ticket.planApprovedAt && trimmed.length > 200) {
    // Planning phase — save/update implementation plan (unchanged logic)
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
        .values({ ticketId, type: "implementation_plan", content: trimmed, version: 1, authorPersonaId: personaId || null, createdAt: now, updatedAt: now })
        .run();
    }

    savedDocType = "implementation_plan";

    if (!ticket.planCompletedAt) {
      db.update(tickets)
        .set({ planCompletedAt: now, planCompletedBy: personaId || null })
        .where(eq(tickets.id, ticketId))
        .run();
    }
  }

  // Post agent comment — when full content was saved as a document, post a brief note
  let commentContent: string;
  if (savedDocType) {
    const docLabel = savedDocType === "research" ? "research document"
      : savedDocType === "design" ? "design document"
      : "implementation plan";
    commentContent = `Posted ${docLabel} v${savedVersion}. View the full document above.`;
  } else {
    commentContent = trimmed;
  }
  db.insert(comments)
    .values({
      ticketId,
      authorType: "agent",
      personaId: personaId || null,
      content: commentContent,
      documentId: documentId || null,
    })
    .run();

  // Bump comment count
  db.update(tickets)
    .set({ commentCount: (ticket.commentCount || 0) + 1 })
    .where(eq(tickets.id, ticketId))
    .run();

  // ── Auto-dispatch chain (version-based) ─────────────────
  // Research workflow: v1 (researcher) → v2 (critic) → v3 (researcher) → human
  if (savedDocType === "research") {
    if (savedVersion === 1) {
      // v1 done → dispatch critic for v2
      const authorName = completingPersona?.name || "An agent";
      const criticPrompt = `${authorName} just completed initial research (v1). Review it critically — verify claims, find gaps, challenge assumptions — and produce v2.`;
      fetch(`http://localhost:3000/api/tickets/${ticketId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentContent: criticPrompt, targetRole: "critic", silent: true }),
      }).catch(() => {});
    } else if (savedVersion === 2) {
      // v2 done (critic) → dispatch researcher for v3
      const criticName = completingPersona?.name || "The critic";
      const revisionPrompt = `${criticName} completed the critic review (v2). Read their feedback and produce the final v3 research document addressing their corrections and filling gaps.`;
      fetch(`http://localhost:3000/api/tickets/${ticketId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentContent: revisionPrompt, targetRole: "researcher", silent: true }),
      }).catch(() => {});
    }
    // v3: no auto-dispatch — human reviews
  } else if (savedDocType === "implementation_plan") {
    // Dispatch critic to review the implementation plan
    const planAuthor = completingPersona?.name || "A developer";
    const criticPrompt = `${planAuthor} just completed the implementation plan. Review it critically — check feasibility, missing edge cases, architectural risks, and whether it fully addresses the acceptance criteria.`;
    fetch(`http://localhost:3000/api/tickets/${ticketId}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentContent: criticPrompt, targetRole: "critic" }),
    }).catch(() => {});
  }

  const agentName = completingPersona?.name ?? "Agent";
  if (savedDocType) {
    const docLabel = savedDocType === "research" ? "research document"
      : savedDocType === "design" ? "design document"
      : "implementation plan";
    logAuditEvent({
      ticketId,
      event: "document_created",
      actorType: "agent",
      actorId: personaId,
      actorName: agentName,
      detail: `Created ${docLabel} v${savedVersion}`,
      metadata: { docType: savedDocType, version: savedVersion },
    });
  }

  logAuditEvent({
    ticketId,
    event: "agent_completed",
    actorType: "agent",
    actorId: personaId,
    actorName: agentName,
    detail: `${agentName} completed work`,
    metadata: { role: completingRole },
  });

  return NextResponse.json({ ok: true, savedVersion });
}

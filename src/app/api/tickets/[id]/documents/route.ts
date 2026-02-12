import { NextResponse } from "next/server";
import { getDocumentsByTicket, getLatestDocumentVersion, getLatestDocumentByType, createDocument, getDocumentByType, updateDocument, deleteDocumentsByType } from "@/db/data/documents";
import { getTicketById, updateTicket } from "@/db/data/tickets";
import { getPersonaRaw } from "@/db/data/personas";
import { logAuditEvent } from "@/db/data/audit";
import { createCommentAndBumpCount } from "@/db/data/comments";
import { getSetting } from "@/db/data/settings";
import { fireDispatch } from "@/lib/dispatch-agent";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const DOC_TYPES = ["research", "implementation_plan", "design"] as const;
type DocType = (typeof DOC_TYPES)[number];

function isRegression(newContent: string, existingContent: string | null | undefined): boolean {
  if (!existingContent) return false;
  return newContent.length / existingContent.length < 0.3;
}

const DOC_LABELS: Record<DocType, string> = {
  research: "Research document",
  implementation_plan: "Implementation plan",
  design: "Design document",
};

// GET /api/tickets/[id]/documents
export async function GET(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;
  const docs = await getDocumentsByTicket(ticketId);
  return NextResponse.json({ documents: docs });
}

// POST /api/tickets/[id]/documents — Save a document (agent tool call or UI)
// Body: { type, content, personaId }
// Handles: versioning, regression guard, accumulative research, auto-dispatch, audit
export async function POST(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;
  const { type: typeParam, content, personaId } = await req.json();

  if (!typeParam || !DOC_TYPES.includes(typeParam as DocType)) {
    return NextResponse.json({ error: `Invalid type. Must be: ${DOC_TYPES.join(", ")}` }, { status: 400 });
  }
  const type = typeParam as DocType;
  const trimmed = content?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const persona = personaId ? await getPersonaRaw(personaId) : null;
  const agentName = persona?.name ?? "Unknown";
  const now = new Date().toISOString();

  // ── Determine version ──────────────────────────────────
  let savedVersion: number;
  let documentContent = trimmed;

  if (type === "research") {
    // Research uses append-only versioned rows (v1, v2, v3)
    const currentMax = await getLatestDocumentVersion(ticketId, "research");
    if (currentMax >= 3) {
      return NextResponse.json({ error: "Research capped at 3 versions" }, { status: 400 });
    }
    const nextVersion = currentMax + 1;

    // Regression guard
    const previousDoc = currentMax > 0 ? await getLatestDocumentByType(ticketId, "research") : null;
    if (previousDoc && isRegression(trimmed, previousDoc.content)) {
      return NextResponse.json({
        error: "Regression rejected",
        detail: `New content (${trimmed.length} chars) is less than 30% of previous (${previousDoc.content.length} chars)`,
      }, { status: 422 });
    }

    // Accumulative v2: append critic review below v1
    if (nextVersion === 2 && previousDoc?.content) {
      const criticName = agentName;
      documentContent = previousDoc.content
        + `\n\n---\n\n## Review by ${criticName}\n\n`
        + trimmed;
    }

    await createDocument({
      ticketId, type: "research", content: documentContent,
      version: nextVersion, authorPersonaId: personaId || null,
    });
    savedVersion = nextVersion;

    // Mark research completed after v3
    if (nextVersion >= 3 && !ticket.researchCompletedAt) {
      await updateTicket(ticketId, { researchCompletedAt: now, researchCompletedBy: personaId || null });
    }
  } else {
    // Design and implementation_plan: upsert (single row, version increments)
    const existing = await getDocumentByType(ticketId, type);

    if (existing && isRegression(trimmed, existing.content)) {
      return NextResponse.json({
        error: "Regression rejected",
        detail: `New content (${trimmed.length} chars) is less than 30% of previous (${existing.content.length} chars)`,
      }, { status: 422 });
    }

    if (existing) {
      savedVersion = (existing.version || 0) + 1;
      await updateDocument(existing.id, { content: trimmed, version: savedVersion });
    } else {
      savedVersion = 1;
      await createDocument({
        ticketId, type, content: trimmed,
        version: 1, authorPersonaId: personaId || null,
      });
    }

    // Mark plan completed
    if (type === "implementation_plan" && !ticket.planCompletedAt) {
      await updateTicket(ticketId, { planCompletedAt: now, planCompletedBy: personaId || null });
    }
  }

  // ── Post brief comment ─────────────────────────────────
  const label = DOC_LABELS[type];
  await createCommentAndBumpCount({
    ticketId, authorType: personaId ? "agent" : "human",
    personaId: personaId || null,
    content: `${label} v${savedVersion} saved.`,
  });

  // ── Audit ──────────────────────────────────────────────
  await logAuditEvent({
    ticketId,
    event: "document_created",
    actorType: personaId ? "agent" : "human",
    actorId: personaId,
    actorName: agentName,
    detail: `Created ${label.toLowerCase()} v${savedVersion}`,
    metadata: { docType: type, version: savedVersion },
  });

  // ── Auto-dispatch chain ────────────────────────────────
  if (type === "research") {
    if (savedVersion === 1) {
      const template = await getSetting("prompt_dispatch_critic_v2") || "{{authorName}} just completed initial research (v1). Review it critically and produce v2.";
      fireDispatch("http://localhost:3000", ticketId, {
        commentContent: template.replace(/\{\{authorName\}\}/g, agentName),
        targetRole: "critic", silent: true,
      }, "documents/research-v1");
    } else if (savedVersion === 2) {
      const template = await getSetting("prompt_dispatch_researcher_v3") || "{{criticName}} completed the critic review (v2). Produce the final v3 research document.";
      fireDispatch("http://localhost:3000", ticketId, {
        commentContent: template.replace(/\{\{criticName\}\}/g, agentName),
        targetRole: "researcher", silent: true,
      }, "documents/research-v2");
    }
  } else if (type === "implementation_plan" && savedVersion === 1 && persona?.role !== "critic") {
    const criticTemplate = await getSetting("prompt_dispatch_plan_critic") || "{{authorName}} just completed the implementation plan. Review it critically.";
    fireDispatch("http://localhost:3000", ticketId, {
      commentContent: criticTemplate.replace(/\{\{authorName\}\}/g, agentName),
      targetRole: "critic",
    }, "documents/plan-critique");

    const hackerTemplate = await getSetting("prompt_dispatch_plan_hacker") || "{{authorName}} just completed the implementation plan. Review it from a security perspective.";
    fireDispatch("http://localhost:3000", ticketId, {
      commentContent: hackerTemplate.replace(/\{\{authorName\}\}/g, agentName),
      targetRole: "hacker", conversational: true, silent: true,
    }, "documents/plan-security");
  }

  return NextResponse.json({ ok: true, version: savedVersion, type });
}

// DELETE /api/tickets/[id]/documents?type=research
export async function DELETE(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;
  const { searchParams } = new URL(req.url);
  const typeParam = searchParams.get("type");

  if (!typeParam || !DOC_TYPES.includes(typeParam as DocType)) {
    return NextResponse.json({ error: `Invalid type. Must be: ${DOC_TYPES.join(", ")}` }, { status: 400 });
  }
  const type = typeParam as DocType;

  await deleteDocumentsByType(ticketId, type);

  await logAuditEvent({
    ticketId,
    event: "document_deleted",
    actorType: "human",
    actorName: "System",
    detail: `Deleted ${DOC_LABELS[type].toLowerCase()}`,
    metadata: { docType: type },
  });

  if (type === "research") {
    await updateTicket(ticketId, {
      researchCompletedAt: null, researchCompletedBy: null,
      researchApprovedAt: null, researchApprovedBy: null,
      lastAgentActivity: null, assigneeId: null,
    });
  } else if (type === "implementation_plan") {
    await updateTicket(ticketId, {
      planCompletedAt: null, planCompletedBy: null,
      planApprovedAt: null, planApprovedBy: null,
      lastAgentActivity: null, assigneeId: null,
    });
  }

  return NextResponse.json({ ok: true });
}

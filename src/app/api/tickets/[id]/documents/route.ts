import { NextResponse } from "next/server";
import { getDocumentsByTicket, getLatestDocumentVersion, getLatestDocumentByType, createDocument, getDocumentByType, updateDocument, deleteDocumentsByType } from "@/db/data/documents";
import { getTicketById, updateTicket } from "@/db/data/tickets";
import { getPersonaRaw } from "@/db/data/personas";
import { logAuditEvent } from "@/db/data/audit";
import { createCommentAndBumpCount } from "@/db/data/comments";
import { getSetting } from "@/db/data/settings";
import { fireDispatch } from "@/lib/dispatch-agent";
import { spawn } from "node:child_process";
import path from "node:path";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Trigger QMD sync in background (non-blocking) so new artifacts are searchable
function triggerQMDSync() {
  const bonsaiCli = path.join(process.cwd(), "bin", "bonsai-cli.ts");
  const webappDir = process.cwd();

  const child = spawn("npx", ["tsx", bonsaiCli, "sync-artifacts"], {
    cwd: webappDir,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, BONSAI_ENV: process.env.BONSAI_ENV || "dev" },
  });
  child.unref();
}

const DOC_TYPES = ["research", "implementation_plan"] as const;
type DocType = (typeof DOC_TYPES)[number];

function isRegression(newContent: string, existingContent: string | null | undefined): boolean {
  if (!existingContent) return false;
  return newContent.length / existingContent.length < 0.3;
}

const DOC_LABELS: Record<DocType, string> = {
  research: "Research document",
  implementation_plan: "Implementation plan",
};

// GET /api/tickets/[id]/documents
export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);
  const docs = await getDocumentsByTicket(ticketId);
  return NextResponse.json({ documents: docs });
}

// POST /api/tickets/[id]/documents — Save a document (agent tool call or UI)
// Body: { type, content, personaId }
// Handles: versioning, regression guard, accumulative research, auto-dispatch, audit
export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);
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
    // Research: single version only (v1)
    const existing = await getDocumentByType(ticketId, "research");
    if (existing) {
      return NextResponse.json({ error: "Research v1 already exists" }, { status: 400 });
    }

    await createDocument({
      ticketId, type: "research", content: trimmed,
      version: 1, authorPersonaId: personaId || null,
    });
    savedVersion = 1;

    // Mark research completed immediately after v1
    if (!ticket.researchCompletedAt) {
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

  // Trigger QMD sync so this artifact is immediately searchable
  triggerQMDSync();

  return NextResponse.json({ ok: true, version: savedVersion, type });
}

// DELETE /api/tickets/[id]/documents?type=research
export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);
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

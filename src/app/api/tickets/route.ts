import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, users, comments, ticketDocuments } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getTickets, getSetting, logAuditEvent } from "@/db/queries";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const result = getTickets(projectId ? Number(projectId) : undefined);
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const { ticketId, state } = await req.json();
  if (!ticketId || !state) {
    return NextResponse.json({ error: "ticketId and state required" }, { status: 400 });
  }
  // Ship state requires merge — redirect to ship endpoint
  if (state === "ship") {
    const origin = new URL(req.url).origin;
    const shipRes = await fetch(`${origin}/api/tickets/${ticketId}/ship`, { method: "POST" });
    const shipData = await shipRes.json();
    return NextResponse.json(shipData, { status: shipRes.status });
  }

  const prevTicket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  const prevState = prevTicket?.state;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { state };

  // When dragged to "plan", mark research as approved so heartbeat + dispatch pick it up
  if (state === "plan" && !prevTicket?.researchApprovedAt) {
    updates.researchApprovedAt = now;
  }

  db.update(tickets).set(updates).where(eq(tickets.id, ticketId)).run();

  // Post system comment for the state transition
  if (prevState && prevState !== state) {
    const reasonMap: Record<string, string> = {
      plan: "research approved",
      build: "plan approved",
      ship: "implementation complete",
    };
    const reason = reasonMap[state] || "manual move";
    db.insert(comments)
      .values({
        ticketId,
        authorType: "system",
        content: `Moved from **${prevState}** to **${state}** — ${reason}`,
      })
      .run();
    db.update(tickets)
      .set({ commentCount: sql`COALESCE(${tickets.commentCount}, 0) + 1` })
      .where(eq(tickets.id, ticketId))
      .run();
  }

  logAuditEvent({
    ticketId,
    event: "state_changed",
    actorType: "human",
    actorName: "System",
    detail: `State changed from ${prevState} to ${state}`,
    metadata: { from: prevState, to: state },
  });

  const origin = new URL(req.url).origin;

  // When moved to "plan", dispatch developer to create implementation plan
  if (state === "plan") {
    fetch(`${origin}/api/tickets/${ticketId}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commentContent: "Research has been approved. Create the implementation plan now.",
        targetRole: "developer",
      }),
    }).catch(() => {});
  }

  // When moved to "build", auto-dispatch developer to start implementation
  if (state === "build") {
    const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
    if (ticket?.planApprovedAt) {
      fetch(`${origin}/api/tickets/${ticketId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentContent: "The implementation plan has been approved and the ticket is in build. Begin coding the implementation now. Follow the plan step by step.",
          targetRole: "developer",
        }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const { ticketId, title, description, acceptanceCriteria, type, state } = await req.json();
  if (!ticketId) {
    return NextResponse.json({ error: "ticketId required" }, { status: 400 });
  }
  db.update(tickets)
    .set({
      title: title?.trim() || undefined,
      description: description?.trim() || null,
      acceptanceCriteria: acceptanceCriteria?.trim() || null,
      type: type || undefined,
      state: state || undefined,
    })
    .where(eq(tickets.id, ticketId))
    .run();

  const editUser = db.select().from(users).limit(1).get();
  logAuditEvent({
    ticketId,
    event: "ticket_edited",
    actorType: "human",
    actorId: editUser?.id,
    actorName: editUser?.name ?? "Unknown",
    detail: "Edited ticket details",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { ticketId } = await req.json();
  if (!ticketId) {
    return NextResponse.json({ error: "ticketId required" }, { status: 400 });
  }
  const delUser = db.select().from(users).limit(1).get();
  logAuditEvent({
    ticketId,
    event: "ticket_deleted",
    actorType: "human",
    actorId: delUser?.id,
    actorName: delUser?.name ?? "Unknown",
    detail: "Deleted ticket",
  });

  // Soft delete — set deletedAt timestamp, preserve all data
  db.update(tickets)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(tickets.id, ticketId))
    .run();
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const { title, type, description, acceptanceCriteria, projectId } =
    await req.json();

  // Get current user as creator
  const user = db.select().from(users).limit(1).get();

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // Generate next ticket ID
  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .get();
  const num = (countRow?.count ?? 0) + 1;
  const id = `tkt_${String(num).padStart(2, "0")}`;

  const ticket = db
    .insert(tickets)
    .values({
      id,
      title: title.trim(),
      type: type || "feature",
      state: "research",
      description: description?.trim() || null,
      acceptanceCriteria: acceptanceCriteria?.trim() || null,
      priority: 500,
      projectId: projectId || Number(getSetting("active_project_id")) || 1,
      createdBy: user?.id ?? null,
      commentCount: 0,
      hasAttachments: false,
    })
    .returning()
    .get();

  logAuditEvent({
    ticketId: id,
    event: "ticket_created",
    actorType: "human",
    actorId: user?.id,
    actorName: user?.name ?? "Unknown",
    detail: `Created ticket "${title.trim()}"`,
    metadata: { type: type || "feature", state: "research" },
  });

  // Auto-dispatch research agent (fire-and-forget)
  try {
    const origin = new URL(req.url).origin;
    const ticketSummary = `${title.trim()}${description ? `\n\n${description.trim()}` : ""}${acceptanceCriteria ? `\n\nAcceptance Criteria:\n${acceptanceCriteria.trim()}` : ""}`;

    // Dispatch researcher
    fetch(`${origin}/api/tickets/${id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commentContent: `New ticket created. Research this ticket.\n\n${ticketSummary}`,
      }),
    }).catch(() => {});

    // Dispatch designer for UI/UX review
    fetch(`${origin}/api/tickets/${id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commentContent: `New ticket created. Review the UI/UX implications and propose design direction.\n\n${ticketSummary}`,
        targetRole: "designer",
        silent: true,
      }),
    }).catch(() => {});
  } catch {
    // dispatch failure shouldn't block ticket creation
  }

  return NextResponse.json({ success: true, ticket });
}

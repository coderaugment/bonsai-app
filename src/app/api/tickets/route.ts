import { NextResponse } from "next/server";
import { getTickets, getTicketById, createTicket, updateTicket, softDeleteTicket, generateTicketId, getSetting, getUser, createSystemCommentAndBumpCount, logAuditEvent } from "@/db/data";
import { fireDispatch } from "@/lib/dispatch-agent";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const result = await getTickets(projectId ? Number(projectId) : undefined);
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

  const prevTicket = await getTicketById(ticketId);
  const prevState = prevTicket?.state;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { state };

  // When dragged to "plan", mark research as approved so heartbeat + dispatch pick it up
  if (state === "plan" && !prevTicket?.researchApprovedAt) {
    updates.researchApprovedAt = now;
  }

  await updateTicket(ticketId, updates);

  // Post system comment for the state transition
  if (prevState && prevState !== state) {
    const reasonMap: Record<string, string> = {
      plan: "research approved",
      build: "plan approved",
      ship: "implementation complete",
    };
    const reason = reasonMap[state] || "manual move";
    await createSystemCommentAndBumpCount(
      ticketId,
      `Moved from **${prevState}** to **${state}** — ${reason}`
    );
  }

  await logAuditEvent({
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
    fireDispatch(origin, ticketId, {
      commentContent: "Research has been approved. Create the implementation plan now.",
      targetRole: "developer",
    }, "state-change/plan");
  }

  // When moved to "build", auto-dispatch developer to start implementation
  if (state === "build") {
    const ticket = await getTicketById(ticketId);
    if (ticket?.planApprovedAt) {
      fireDispatch(origin, ticketId, {
        commentContent: "The implementation plan has been approved and the ticket is in build. Begin coding the implementation now. Follow the plan step by step.",
        targetRole: "developer",
      }, "state-change/build");
    }
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const { ticketId, title, description, acceptanceCriteria, type, state } = await req.json();
  if (!ticketId) {
    return NextResponse.json({ error: "ticketId required" }, { status: 400 });
  }
  await updateTicket(ticketId, {
    title: title?.trim() || undefined,
    description: description?.trim() || null,
    acceptanceCriteria: acceptanceCriteria?.trim() || null,
    type: type || undefined,
    state: state || undefined,
  });

  const editUser = await getUser();
  await logAuditEvent({
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
  const delUser = await getUser();
  await logAuditEvent({
    ticketId,
    event: "ticket_deleted",
    actorType: "human",
    actorId: delUser?.id,
    actorName: delUser?.name ?? "Unknown",
    detail: "Deleted ticket",
  });

  // Soft delete — set deletedAt timestamp, preserve all data
  await softDeleteTicket(ticketId);
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const { title, type, description, acceptanceCriteria, projectId } =
    await req.json();

  // Get current user as creator
  const user = await getUser();

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // Generate next ticket ID
  const id = await generateTicketId();

  const activeProjectId = await getSetting("active_project_id");
  const ticket = await createTicket({
    id,
    title: title.trim(),
    type: type || "feature",
    state: "research",
    description: description?.trim() || null,
    acceptanceCriteria: acceptanceCriteria?.trim() || null,
    priority: 500,
    projectId: projectId || Number(activeProjectId) || 1,
    createdBy: user?.id ?? null,
    commentCount: 0,
    hasAttachments: false,
  });

  await logAuditEvent({
    ticketId: id,
    event: "ticket_created",
    actorType: "human",
    actorId: user?.id,
    actorName: user?.name ?? "Unknown",
    detail: `Created ticket "${title.trim()}"`,
    metadata: { type: type || "feature", state: "research" },
  });

  // Auto-dispatch research agent
  const origin = new URL(req.url).origin;
  const ticketSummary = `${title.trim()}${description ? `\n\n${description.trim()}` : ""}${acceptanceCriteria ? `\n\nAcceptance Criteria:\n${acceptanceCriteria.trim()}` : ""}`;

  fireDispatch(origin, id, {
    commentContent: `New ticket created. Research this ticket.\n\n${ticketSummary}`,
  }, "ticket-create/research");

  fireDispatch(origin, id, {
    commentContent: `New ticket created. Review the UI/UX implications and propose design direction.\n\n${ticketSummary}`,
    targetRole: "designer",
    silent: true,
  }, "ticket-create/designer");

  return NextResponse.json({ success: true, ticket });
}

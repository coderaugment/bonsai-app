import { NextResponse } from "next/server";
import { getTickets, getTicketById, createTicket, updateTicket, softDeleteTicket, getSetting, getUser, createSystemCommentAndBumpCount, logAuditEvent } from "@/db/data";
import { fireDispatch } from "@/lib/dispatch-agent";
import { formatTicketSlug } from "@/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const result = await getTickets(projectId ? Number(projectId) : undefined);
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const { ticketId, state } = await req.json();
  const numTicketId = Number(ticketId);
  if (!numTicketId || !state) {
    return NextResponse.json({ error: "ticketId and state required" }, { status: 400 });
  }
  // Ship state requires merge — redirect to ship endpoint
  if (state === "ship") {
    const origin = new URL(req.url).origin;
    const shipRes = await fetch(`${origin}/api/tickets/${numTicketId}/ship`, { method: "POST" });
    const shipData = await shipRes.json();
    return NextResponse.json(shipData, { status: shipRes.status });
  }

  const prevTicket = await getTicketById(numTicketId);
  const prevState = prevTicket?.state;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { state };

  // When dragged to "plan", mark research as approved so heartbeat + dispatch pick it up
  if (state === "plan" && !prevTicket?.researchApprovedAt) {
    updates.researchApprovedAt = now;
  }

  await updateTicket(numTicketId, updates);

  // Post system comment for the state transition
  if (prevState && prevState !== state) {
    const reasonMap: Record<string, string> = {
      plan: "research approved",
      build: "plan approved",
      ship: "implementation complete",
    };
    const reason = reasonMap[state] || "manual move";
    await createSystemCommentAndBumpCount(
      numTicketId,
      `Moved from **${prevState}** to **${state}** — ${reason}`
    );
  }

  await logAuditEvent({
    ticketId: numTicketId,
    event: "state_changed",
    actorType: "human",
    actorName: "System",
    detail: `State changed from ${prevState} to ${state}`,
    metadata: { from: prevState, to: state },
  });

  const origin = new URL(req.url).origin;

  // When moved to "plan", dispatch developer to create implementation plan
  if (state === "plan") {
    fireDispatch(origin, numTicketId, {
      commentContent: "Research has been approved. Create the implementation plan now.",
      targetRole: "developer",
    }, "state-change/plan");
  }

  // When moved to "build", auto-dispatch developer to start implementation
  if (state === "build") {
    const ticket = await getTicketById(numTicketId);
    if (ticket?.planApprovedAt) {
      fireDispatch(origin, numTicketId, {
        commentContent: "The implementation plan has been approved and the ticket is in build. Begin coding the implementation now. Follow the plan step by step.",
        targetRole: "developer",
      }, "state-change/build");
    }
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const { ticketId, title, description, acceptanceCriteria, type, state, isEpic, epicId } = await req.json();
  const numTicketId = Number(ticketId);
  if (!numTicketId) {
    return NextResponse.json({ error: "ticketId required" }, { status: 400 });
  }
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title?.trim() || undefined;
  if (description !== undefined) updates.description = description?.trim() || null;
  if (acceptanceCriteria !== undefined) updates.acceptanceCriteria = acceptanceCriteria?.trim() || null;
  if (type !== undefined) updates.type = type;
  if (state !== undefined) updates.state = state;
  if (isEpic !== undefined) updates.isEpic = isEpic;
  if (epicId !== undefined) updates.epicId = epicId ? Number(epicId) : null;
  await updateTicket(numTicketId, updates);

  const editUser = await getUser();
  await logAuditEvent({
    ticketId: numTicketId,
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
  const numTicketId = Number(ticketId);
  if (!numTicketId) {
    return NextResponse.json({ error: "ticketId required" }, { status: 400 });
  }
  const delUser = await getUser();
  await logAuditEvent({
    ticketId: numTicketId,
    event: "ticket_deleted",
    actorType: "human",
    actorId: delUser?.id,
    actorName: delUser?.name ?? "Unknown",
    detail: "Deleted ticket",
  });

  // Soft delete — set deletedAt timestamp, preserve all data
  await softDeleteTicket(numTicketId);
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const { title, type, description, acceptanceCriteria, projectId, epicId, isEpic } =
    await req.json();

  // Get current user as creator
  const user = await getUser();

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const activeProjectId = await getSetting("active_project_id");
  const ticket = await createTicket({
    title: title.trim(),
    type: type || "feature",
    state: "review",
    description: description?.trim() || null,
    acceptanceCriteria: acceptanceCriteria?.trim() || null,
    priority: 500,
    projectId: projectId || Number(activeProjectId) || 1,
    createdBy: user?.id ?? null,
    commentCount: 0,
    hasAttachments: false,
    isEpic: isEpic ?? false,
    epicId: epicId ? Number(epicId) : null,
  });

  const id = ticket.id; // auto-generated integer

  await logAuditEvent({
    ticketId: id,
    event: "ticket_created",
    actorType: "human",
    actorId: user?.id,
    actorName: user?.name ?? "Unknown",
    detail: `Created ticket "${title.trim()}"`,
    metadata: { type: type || "feature", state: "review", epicId: epicId || null },
  });

  const origin = new URL(req.url).origin;
  const ticketSummary = `${title.trim()}${description ? `\n\n${description.trim()}` : ""}${acceptanceCriteria ? `\n\nAcceptance Criteria:\n${acceptanceCriteria.trim()}` : ""}`;

  if (isEpic) {
    // Explicitly created as epic: dispatch lead only to break it down
    fireDispatch(origin, id, {
      commentContent: `This is an epic ticket. Break it down into smaller, focused sub-tickets using the create-sub-ticket tool. Each sub-ticket should be a single, independently workable item.\n\nEpic:\n${ticketSummary}`,
      targetRole: "lead",
    }, "epic-create/breakdown");
  } else if (epicId) {
    // Sub-ticket of an epic: dispatch research + designer normally
    fireDispatch(origin, id, {
      commentContent: `New sub-ticket created (part of epic). Research this ticket.\n\n${ticketSummary}`,
    }, "ticket-create/research");

    fireDispatch(origin, id, {
      commentContent: `New sub-ticket created. Review the UI/UX implications and propose design direction.\n\n${ticketSummary}`,
      targetRole: "designer",
      silent: true,
    }, "ticket-create/designer");
  } else {
    // Standalone ticket: lead evaluates first, then delegates to other roles
    fireDispatch(origin, id, {
      commentContent: `New ticket created. You are the first to look at this ticket — no other agents have been dispatched yet.\n\nEvaluate this ticket. Almost all tickets should be treated as normal single work items. Only mark something as an epic if it explicitly describes MULTIPLE INDEPENDENT features or projects that have no logical connection to each other (e.g. "build a blog AND redesign the dashboard AND add user auth"). A ticket with multiple requirements or bullet points about ONE feature is NOT an epic — it's just a well-described ticket.\n\nIf it is a normal ticket (the vast majority of cases), say so briefly. The researcher and designer will be dispatched automatically after you finish.\n\nOnly if it is truly multiple independent projects: use set-epic.sh to mark it as an epic, then use create-sub-ticket.sh to break it down.\n\n${ticketSummary}`,
      targetRole: "lead",
    }, "ticket-create/lead-evaluate");
  }

  return NextResponse.json({ success: true, ticket });
}

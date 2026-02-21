import { NextResponse } from "next/server";
import { getTickets, getTicketById, createTicket, updateTicket, softDeleteTicket, getSetting, createSystemCommentAndBumpCount, logAuditEvent } from "@/db/data";
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
  if (state === "shipped") {
    const origin = new URL(req.url).origin;
    const shipRes = await fetch(`${origin}/api/tickets/${numTicketId}/ship`, { method: "POST" });
    const shipData = await shipRes.json();
    return NextResponse.json(shipData, { status: shipRes.status });
  }

  const prevTicket = await getTicketById(numTicketId);
  const prevState = prevTicket?.state;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { state };

  // When dragged to "planning", mark research as approved so heartbeat + dispatch pick it up
  if (state === "planning" && !prevTicket?.researchApprovedAt) {
    updates.researchApprovedAt = now;
  }

  // When dragged to "building", mark both research and plan as approved (manual move = human approval)
  if (state === "building") {
    if (!prevTicket?.researchApprovedAt) {
      updates.researchApprovedAt = now;
    }
    if (!prevTicket?.planApprovedAt) {
      updates.planApprovedAt = now;
    }
  }

  await updateTicket(numTicketId, updates);

  // Post system comment for the state transition
  if (prevState && prevState !== state) {
    const reasonMap: Record<string, string> = {
      planning: "research approved",
      building: "plan approved",
      shipped: "implementation complete",
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

  // When moved to "planning", dispatch researcher to begin research
  if (state === "planning") {
    fireDispatch(origin, numTicketId, {
      commentContent: "Begin research on this ticket. Investigate the codebase and document your findings.",
      targetRole: "researcher",
    }, "state-change/planning");
  }

  // When moved to "building", auto-dispatch developer to start implementation
  if (state === "building") {
    fireDispatch(origin, numTicketId, {
      commentContent: "The implementation plan has been approved and the ticket is in build. Begin coding the implementation now. Follow the plan step by step.",
      targetRole: "developer",
    }, "state-change/building");
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

  const userName = await getSetting("user_name");
  await logAuditEvent({
    ticketId: numTicketId,
    event: "ticket_edited",
    actorType: "human",
    actorId: null,
    actorName: userName ?? "User",
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
  const userName = await getSetting("user_name");
  await logAuditEvent({
    ticketId: numTicketId,
    event: "ticket_deleted",
    actorType: "human",
    actorId: null,
    actorName: userName ?? "User",
    detail: "Deleted ticket",
  });

  // Soft delete — set deletedAt timestamp, preserve all data
  await softDeleteTicket(numTicketId);
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const { title, type, description, acceptanceCriteria, projectId, epicId, isEpic } =
    await req.json();

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const activeProjectId = await getSetting("active_project_id");
  const userName = await getSetting("user_name");
  const ticket = await createTicket({
    title: title.trim(),
    type: type || "feature",
    state: "planning",
    description: description?.trim() || null,
    acceptanceCriteria: acceptanceCriteria?.trim() || null,
    priority: 500,
    projectId: projectId || Number(activeProjectId) || 1,
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
    actorId: null,
    actorName: userName ?? "User",
    detail: `Created ticket "${title.trim()}"`,
    metadata: { type: type || "feature", state: "planning", epicId: epicId || null },
  });

  const origin = new URL(req.url).origin;
  const ticketSummary = `${title.trim()}${description ? `\n\n${description.trim()}` : ""}${acceptanceCriteria ? `\n\nAcceptance Criteria:\n${acceptanceCriteria.trim()}` : ""}`;

  if (isEpic) {
    // Epic breakdown is handled interactively by the wizard UI — no auto-dispatch
  } else if (epicId) {
    // Sub-ticket of an epic: dispatch lead to triage, then lead dispatches researcher.
    // Do NOT dispatch designer or developer at creation — they run in building phase only.
    const leadContext = await getSetting("context_role_lead") || "";
    const leadPrompt = await getSetting("prompt_lead_new_ticket") || "New ticket created. Evaluate it and dispatch the researcher to begin research. Do NOT dispatch developer or designer — they work in the building phase only.";
    fireDispatch(origin, id, {
      commentContent: [ticketSummary, "New ticket created. Begin research on this ticket. Investigate the codebase, understand the requirements, and document your findings."].filter(Boolean).join("\n\n"),
      targetRole: "researcher",
    }, "ticket-create/researcher-research");
  } else {
    // Standalone ticket: lead evaluates first, then dispatches researcher for planning.
    const leadContext = await getSetting("context_role_lead") || "";
    const leadPrompt = await getSetting("prompt_lead_new_ticket") || "New ticket created. Evaluate it and dispatch the researcher to begin research. Do NOT dispatch developer or designer — they run in the building phase only.";
    const leadContent = [leadContext, leadPrompt, ticketSummary].filter(Boolean).join("\n\n");
    fireDispatch(origin, id, {
      commentContent: [ticketSummary, "New ticket created. Begin research on this ticket. Investigate the codebase, understand the requirements, and document your findings."].filter(Boolean).join("\n\n"),
      targetRole: "researcher",
    }, "ticket-create/researcher-research");
  }

  return NextResponse.json({ success: true, ticket });
}

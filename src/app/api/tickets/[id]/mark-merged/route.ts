import { NextResponse } from "next/server";
import { getTicketById, updateTicket } from "@/db/data/tickets";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/tickets/[id]/mark-merged - Mark a ticket as merged to main
export async function POST(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;
  const { mergeCommit } = await req.json();

  // Validate that ticket exists and is in 'ship' state
  const ticket = await getTicketById(ticketId);

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (ticket.state !== "ship") {
    return NextResponse.json(
      { error: "Ticket must be in 'ship' state to be marked as merged" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  await updateTicket(ticketId, {
    mergedAt: now,
    mergeCommit: mergeCommit || null,
  });

  return NextResponse.json({
    ok: true,
    mergedAt: now,
    mergeCommit: mergeCommit || null,
  });
}

// DELETE /api/tickets/[id]/mark-merged - Unmark as merged
export async function DELETE(req: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;

  await updateTicket(ticketId, {
    mergedAt: null,
    mergeCommit: null,
  });

  return NextResponse.json({ ok: true });
}

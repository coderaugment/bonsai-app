import { NextRequest, NextResponse } from "next/server";
import { getTicketById, updateTicket } from "@/db/data/tickets";
import { createCommentAndBumpCount } from "@/db/data/comments";
import { logAuditEvent } from "@/db/data/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);
  const body = await request.json();
  const { reason, authorType = "human" } = body;

  // Verify ticket exists and is in verification state
  const ticket = await getTicketById(ticketId);

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (ticket.state !== "review") {
    return NextResponse.json(
      { error: "Ticket is not in review state" },
      { status: 400 }
    );
  }

  // Set returned flag and move back to building
  await updateTicket(ticketId, {
    returnedFromVerification: true,
    state: "building",
  });

  // Add a comment with the reason
  if (reason) {
    const commentData = {
      ticketId,
      authorType,
      authorId: authorType === "human" ? 1 : null, // TODO: Get actual user ID
      personaId: authorType === "agent" ? ticket.assigneeId : null,
      content: `**Returned from verification:** ${reason}`,
      createdAt: new Date().toISOString(),
    };

    await createCommentAndBumpCount(commentData);

    // Update lastHumanCommentAt if human authored
    if (authorType === "human") {
      await updateTicket(ticketId, {
        lastHumanCommentAt: new Date().toISOString(),
      });
    }
  }

  await logAuditEvent({
    ticketId,
    event: "returned_from_verification",
    actorType: authorType === "agent" ? "agent" : "human",
    actorName: authorType === "agent" ? "Agent" : "Human",
    detail: reason ? `Returned from verification: ${reason.slice(0, 200)}` : "Returned from verification",
    metadata: { from: "review", to: "building" },
  });

  return NextResponse.json({ success: true });
}

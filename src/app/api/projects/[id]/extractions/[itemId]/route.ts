import { NextRequest, NextResponse } from "next/server";
import { updateExtractionStatus, getExtractionById } from "@/db/data/notes";
import { getUser } from "@/db/data/users";
import { generateTicketId, createTicket } from "@/db/data/tickets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const projectId = Number(id);
  const itemIdNum = Number(itemId);
  const { status } = await req.json();

  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json(
      { error: 'status must be "approved" or "rejected"' },
      { status: 400 }
    );
  }

  // Update the extracted item status
  await updateExtractionStatus(itemIdNum, status);

  // If approved, create a real ticket in the research column
  if (status === "approved") {
    const item = await getExtractionById(itemIdNum);

    if (item) {
      const user = await getUser();

      // Generate next ticket ID
      const ticketId = await generateTicketId();

      const ticket = await createTicket({
        id: ticketId,
        title: item.title,
        description: item.description,
        type: item.type as "feature" | "bug" | "chore",
        state: "review",
        priority: 500,
        projectId,
        createdBy: user?.id ?? null,
        commentCount: 0,
        hasAttachments: false,
      });

      return NextResponse.json({ ok: true, ticket });
    }
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getAttachmentsByTicket, createAttachment } from "@/db/data/attachments";
import { updateTicket } from "@/db/data/tickets";

// GET /api/tickets/[id]/attachments - List all attachments for a ticket
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const attachments = await getAttachmentsByTicket(id);

    return NextResponse.json(attachments);
  } catch (error) {
    console.error("Error fetching attachments:", error);
    return NextResponse.json(
      { error: "Failed to fetch attachments" },
      { status: 500 }
    );
  }
}

// POST /api/tickets/[id]/attachments - Upload a new attachment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { filename, mimeType, data, createdByType, createdById } = body;

    if (!filename || !mimeType || !data || !createdByType) {
      return NextResponse.json(
        { error: "Missing required fields: filename, mimeType, data, createdByType" },
        { status: 400 }
      );
    }

    // Insert attachment
    const attachment = await createAttachment({
      ticketId: id,
      filename,
      mimeType,
      data,
      createdByType,
      createdById,
    });

    // Update ticket's hasAttachments flag
    await updateTicket(id, { hasAttachments: true });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Error uploading attachment:", error);
    return NextResponse.json(
      { error: "Failed to upload attachment" },
      { status: 500 }
    );
  }
}

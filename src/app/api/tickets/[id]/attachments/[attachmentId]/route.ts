import { NextRequest, NextResponse } from "next/server";
import { getAttachment, deleteAttachment } from "@/db/data/attachments";

// GET /api/tickets/[id]/attachments/[attachmentId] - Serve a specific attachment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const { id, attachmentId } = await params;

    const attachment = await getAttachment(parseInt(attachmentId));

    if (!attachment || attachment.ticketId !== id) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // Parse base64 data URL (format: "data:image/png;base64,...")
    const matches = attachment.data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json(
        { error: "Invalid attachment data format" },
        { status: 500 }
      );
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${attachment.filename}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving attachment:", error);
    return NextResponse.json(
      { error: "Failed to serve attachment" },
      { status: 500 }
    );
  }
}

// DELETE /api/tickets/[id]/attachments/[attachmentId] - Delete an attachment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const { id, attachmentId } = await params;

    const attachment = await getAttachment(parseInt(attachmentId));

    if (!attachment || attachment.ticketId !== id) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    await deleteAttachment(parseInt(attachmentId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 }
    );
  }
}

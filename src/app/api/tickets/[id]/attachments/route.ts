import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ticketAttachments, tickets } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/tickets/[id]/attachments - List all attachments for a ticket
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const attachments = await db
      .select()
      .from(ticketAttachments)
      .where(eq(ticketAttachments.ticketId, id))
      .all();

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
    const result = await db
      .insert(ticketAttachments)
      .values({
        ticketId: id,
        filename,
        mimeType,
        data,
        createdByType,
        createdById,
      })
      .returning();

    // Update ticket's hasAttachments flag
    await db
      .update(tickets)
      .set({ hasAttachments: true })
      .where(eq(tickets.id, id))
      .run();

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error uploading attachment:", error);
    return NextResponse.json(
      { error: "Failed to upload attachment" },
      { status: 500 }
    );
  }
}

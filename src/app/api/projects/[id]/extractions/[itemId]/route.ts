import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { extractedItems, tickets, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

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
  db.update(extractedItems)
    .set({ status })
    .where(eq(extractedItems.id, itemIdNum))
    .run();

  // If approved, create a real ticket in the research column
  if (status === "approved") {
    const item = db
      .select()
      .from(extractedItems)
      .where(eq(extractedItems.id, itemIdNum))
      .get();

    if (item) {
      const user = db.select().from(users).limit(1).get();

      // Generate next ticket ID
      const countRow = db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .get();
      const num = (countRow?.count ?? 0) + 1;
      const ticketId = `tkt_${String(num).padStart(2, "0")}`;

      const ticket = db
        .insert(tickets)
        .values({
          id: ticketId,
          title: item.title,
          description: item.description,
          type: item.type as "feature" | "bug" | "chore",
          state: "research",
          priority: 500,
          projectId,
          createdBy: user?.id ?? null,
          commentCount: 0,
          hasAttachments: false,
        })
        .returning()
        .get();

      return NextResponse.json({ ok: true, ticket });
    }
  }

  return NextResponse.json({ ok: true });
}

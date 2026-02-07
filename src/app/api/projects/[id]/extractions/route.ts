import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { extractedItems } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const items = db
    .select()
    .from(extractedItems)
    .where(
      and(
        eq(extractedItems.projectId, projectId),
        eq(extractedItems.status, "pending")
      )
    )
    .orderBy(desc(extractedItems.createdAt))
    .all();

  return NextResponse.json(items);
}

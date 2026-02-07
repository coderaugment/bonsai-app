import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projectNotes } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id, noteId } = await params;
  const projectId = Number(id);
  const noteIdNum = Number(noteId);

  db.delete(projectNotes)
    .where(
      and(
        eq(projectNotes.id, noteIdNum),
        eq(projectNotes.projectId, projectId)
      )
    )
    .run();

  return NextResponse.json({ ok: true });
}

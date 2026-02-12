import { NextRequest, NextResponse } from "next/server";
import { deleteNote } from "@/db/data/notes";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id, noteId } = await params;
  const projectId = Number(id);
  const noteIdNum = Number(noteId);

  await deleteNote(projectId, noteIdNum);

  return NextResponse.json({ ok: true });
}

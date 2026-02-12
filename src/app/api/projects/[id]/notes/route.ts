import { NextRequest, NextResponse } from "next/server";
import { getNotesByProject, createNote } from "@/db/data/notes";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const notes = await getNotesByProject(projectId);

  return NextResponse.json(notes);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);
  const body = await req.json();

  const { type = "text", content } = body;
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const note = await createNote(projectId, type as "text" | "image", content);

  return NextResponse.json(note, { status: 201 });
}

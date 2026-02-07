import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projectNotes } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const notes = db
    .select()
    .from(projectNotes)
    .where(eq(projectNotes.projectId, projectId))
    .orderBy(desc(projectNotes.createdAt))
    .all();

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

  const note = db
    .insert(projectNotes)
    .values({ projectId, type, content })
    .returning()
    .get();

  return NextResponse.json(note, { status: 201 });
}

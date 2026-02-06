import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { skills } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/skills - List all skills
export async function GET() {
  const allSkills = db.select().from(skills).all();
  return NextResponse.json(allSkills);
}

// POST /api/skills - Create a new skill
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description, category } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const result = db
    .insert(skills)
    .values({
      name: name.trim(),
      description: description?.trim() || null,
      category: category || null,
    })
    .returning()
    .get();

  return NextResponse.json(result);
}

// PUT /api/skills - Update a skill
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, description, category } = body;

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const result = db
    .update(skills)
    .set({
      ...(name && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(category !== undefined && { category: category || null }),
    })
    .where(eq(skills.id, id))
    .returning()
    .get();

  return NextResponse.json(result);
}

// DELETE /api/skills - Delete a skill
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  db.delete(skills).where(eq(skills.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}

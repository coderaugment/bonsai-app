import { NextRequest, NextResponse } from "next/server";
import { getSkills, createSkill, updateSkill, deleteSkill } from "@/db/data/roles";

// GET /api/skills - List all skills
export async function GET() {
  const allSkills = await getSkills();
  return NextResponse.json(allSkills);
}

// POST /api/skills - Create a new skill
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description, category } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const result = await createSkill({
    name: name.trim(),
    description: description?.trim() || undefined,
    category: category || undefined,
  });

  return NextResponse.json(result);
}

// PUT /api/skills - Update a skill
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, description, category } = body;

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const updates: Parameters<typeof updateSkill>[1] = {};
  if (name !== undefined) {
    updates.name = name.trim();
  }
  if (description !== undefined) {
    updates.description = description?.trim() || undefined;
  }
  if (category !== undefined) {
    updates.category = category || undefined;
  }

  const result = await updateSkill(id, updates);
  return NextResponse.json(result);
}

// DELETE /api/skills - Delete a skill
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  await deleteSkill(parseInt(id));
  return NextResponse.json({ success: true });
}

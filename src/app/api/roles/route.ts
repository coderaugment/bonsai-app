import { NextRequest, NextResponse } from "next/server";
import { getRoles, createRole, updateRole, deleteRole } from "@/db/data/roles";

// GET /api/roles - List all roles with their skills
export async function GET() {
  const allRoles = await getRoles();
  return NextResponse.json(allRoles);
}

// POST /api/roles - Create a new role
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { slug, title, description, color, icon, workflow, systemPrompt, skillIds, tools, folderAccess, skillDefinitions } = body;

  if (!slug?.trim() || !title?.trim()) {
    return NextResponse.json(
      { error: "Slug and title are required" },
      { status: 400 }
    );
  }

  const result = await createRole({
    slug: slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    title: title.trim(),
    description: description?.trim() || undefined,
    color: color || "#6366f1",
    icon: icon || undefined,
    workflow: workflow || undefined,
    systemPrompt: systemPrompt?.trim() || undefined,
    tools: tools || undefined,
    folderAccess: folderAccess || undefined,
    skillDefinitions: skillDefinitions || undefined,
    skillIds: skillIds || undefined,
  });

  return NextResponse.json(result);
}

// PUT /api/roles - Update a role
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, slug, title, description, color, icon, workflow, systemPrompt, skillIds, tools, folderAccess, skillDefinitions } = body;

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const updates: Parameters<typeof updateRole>[1] = {};

  if (slug !== undefined) {
    updates.slug = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  }
  if (title !== undefined) {
    updates.title = title.trim();
  }
  if (description !== undefined) {
    updates.description = description?.trim() || undefined;
  }
  if (color !== undefined) {
    updates.color = color;
  }
  if (icon !== undefined) {
    updates.icon = icon || undefined;
  }
  if (workflow !== undefined) {
    updates.workflow = workflow || undefined;
  }
  if (systemPrompt !== undefined) {
    updates.systemPrompt = systemPrompt?.trim() || undefined;
  }
  if (tools !== undefined) {
    updates.tools = tools || undefined;
  }
  if (folderAccess !== undefined) {
    updates.folderAccess = folderAccess || undefined;
  }
  if (skillDefinitions !== undefined) {
    updates.skillDefinitions = skillDefinitions || undefined;
  }
  if (skillIds !== undefined) {
    updates.skillIds = skillIds;
  }

  const result = await updateRole(id, updates);
  return NextResponse.json(result);
}

// DELETE /api/roles - Delete a role
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  await deleteRole(parseInt(id));
  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { db } from "@/db";
import { personas, roles } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { createPersona, getPersonas } from "@/db/queries";

export async function GET() {
  const all = getPersonas();
  return NextResponse.json(all);
}

export async function POST(req: Request) {
  const { name, role, roleId, personality, skills, processes, goals, permissions, projectId, avatar } =
    await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "Role is required" }, { status: 400 });
  }

  // Look up color from the roles table if roleId is provided
  let color: string | undefined;
  if (roleId) {
    const roleRow = db.select().from(roles).where(eq(roles.id, roleId)).get();
    if (roleRow) color = roleRow.color;
  }

  try {
    const persona = createPersona({
      name: name.trim(),
      role,
      color,
      roleId: roleId ?? undefined,
      personality: personality?.trim(),
      skills: skills || [],
      processes: processes || [],
      goals: goals || [],
      permissions: permissions || { tools: [], folders: [] },
      projectId,
      avatar,
    });

    return NextResponse.json({ success: true, persona });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/personas] createPersona failed:", msg, { roleId, projectId, role });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const { id, name, personality, avatar } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const existing = db.select().from(personas).where(eq(personas.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    updates.name = name.trim();
    updates.slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  if (personality !== undefined) updates.personality = personality?.trim() || null;
  if (avatar !== undefined) updates.avatar = avatar || null;

  const updated = db
    .update(personas)
    .set(updates)
    .where(eq(personas.id, id))
    .returning()
    .get();

  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const existing = db.select().from(personas).where(eq(personas.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  // Prevent deleting the last active persona of a role
  const activeWithSameRole = db
    .select()
    .from(personas)
    .where(and(eq(personas.role, existing.role!), isNull(personas.deletedAt)))
    .all();

  if (activeWithSameRole.length <= 1) {
    return NextResponse.json(
      { error: `Cannot delete the last ${existing.role}` },
      { status: 400 }
    );
  }

  db.update(personas)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(personas.id, id))
    .run();
  return NextResponse.json({ success: true });
}

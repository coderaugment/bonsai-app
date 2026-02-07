import { NextResponse } from "next/server";
import { getProjects } from "@/db/queries";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export function GET() {
  const allProjects = getProjects();
  return NextResponse.json({ projects: allProjects });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (body.name?.trim()) updates.name = body.name.trim();
  if ("description" in body) updates.description = body.description?.trim() || "";
  if ("targetCustomer" in body) updates.targetCustomer = body.targetCustomer?.trim() || "";
  if ("techStack" in body) updates.techStack = body.techStack?.trim() || "";

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  db.update(projects)
    .set(updates)
    .where(eq(projects.id, Number(id)))
    .run();
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "Project id is required" }, { status: 400 });
  }
  db.update(projects)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(projects.id, Number(id)))
    .run();
  return NextResponse.json({ success: true });
}

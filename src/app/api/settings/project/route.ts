import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getProject } from "@/db/queries";

export async function GET() {
  const project = getProject();
  if (!project) {
    return NextResponse.json({ error: "No project found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, githubOwner, githubRepo, buildCommand, runCommand } = body;

  const project = getProject();
  if (!project) {
    return NextResponse.json({ error: "No project found" }, { status: 404 });
  }

  const updates: Record<string, string | null> = {};

  if (name !== undefined) {
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    updates.name = name.trim();
  }

  if (githubOwner !== undefined) {
    updates.githubOwner = githubOwner || null;
  }
  if (githubRepo !== undefined) {
    updates.githubRepo = githubRepo || null;
  }
  if (buildCommand !== undefined) {
    updates.buildCommand = buildCommand?.trim() || null;
  }
  if (runCommand !== undefined) {
    updates.runCommand = runCommand?.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  db.update(projects)
    .set(updates)
    .where(eq(projects.id, Number(project.id)))
    .run();

  return NextResponse.json({ success: true });
}

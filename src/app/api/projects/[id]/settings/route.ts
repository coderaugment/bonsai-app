import { NextResponse } from "next/server";
import { getProjectById, updateProject } from "@/db/data/projects";
import { getWorktreeDir } from "@/lib/worktree-paths";
import * as fs from "fs";
import * as path from "path";

// GET /api/projects/[id]/settings - Get project settings including .env variables
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Read .env file from project directory
  const envPath = path.join(project.localPath, ".env");
  let envVars: Array<{ key: string; value: string }> = [];

  try {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      const lines = envContent.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key) {
            envVars.push({
              key: key.trim(),
              value: valueParts.join("=").trim()
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to read .env:", error);
  }

  // Check if worktree directory exists
  const worktreeDir = getWorktreeDir(project.localPath);
  const worktreeExists = fs.existsSync(worktreeDir);

  return NextResponse.json({
    buildCommand: project.buildCommand,
    runCommand: project.runCommand,
    envVars,
    worktreeDir,
    worktreeExists,
  });
}

// PATCH /api/projects/[id]/settings - Update build/run commands and env vars
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);
  const body = await req.json();

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Update build/run commands in database
  if ("buildCommand" in body || "runCommand" in body) {
    await updateProject(projectId, {
      buildCommand: body.buildCommand ?? project.buildCommand,
      runCommand: body.runCommand ?? project.runCommand,
    });
  }

  // Update .env file
  if (body.envVars) {
    const envPath = path.join(project.localPath, ".env");
    const lines = body.envVars.map((v: { key: string; value: string }) =>
      `${v.key}=${v.value}`
    );
    fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
  }

  return NextResponse.json({ success: true });
}

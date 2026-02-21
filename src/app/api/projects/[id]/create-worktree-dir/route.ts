import { NextResponse } from "next/server";
import { getProjectById } from "@/db/data/projects";
import { getWorktreeDir } from "@/lib/worktree-paths";
import * as fs from "fs";

// POST /api/projects/[id]/create-worktree-dir - Create worktrees directory
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const worktreeDir = getWorktreeDir(project.localPath);

  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(worktreeDir)) {
      fs.mkdirSync(worktreeDir, { recursive: true });
    }

    return NextResponse.json({
      success: true,
      worktreeDir,
      message: "Worktree directory created successfully"
    });
  } catch (error) {
    return NextResponse.json({
      error: "Failed to create worktree directory",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

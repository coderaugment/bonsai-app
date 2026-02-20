import { NextResponse } from "next/server";
import { getProjects, createProject, updateProject, softDeleteProject } from "@/db/data/projects";
import { getGithubToken } from "@/lib/vault";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const HOME = process.env.HOME || "~";
const PROJECTS_DIR = path.join(HOME, "development", "bonsai", "projects");

async function githubFetch(ghPath: string, token: string, options?: RequestInit) {
  return fetch(`https://api.github.com${ghPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}

export async function POST(req: Request) {
  const { name, visibility, description } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const token = await getGithubToken();

  let githubOwner: string | undefined;
  let githubRepo: string | undefined;
  let finalSlug = slug;

  if (token) {
    // Get authenticated user
    const userRes = await githubFetch("/user", token);
    if (userRes.ok) {
      const githubUser = await userRes.json();
      githubOwner = githubUser.login;

      // Check if repo exists
      const repoCheckRes = await githubFetch(`/repos/${githubOwner}/${slug}`, token);
      if (repoCheckRes.status === 404) {
        // Create new repo
        const createRes = await githubFetch("/user/repos", token, {
          method: "POST",
          body: JSON.stringify({
            name: slug,
            description: description?.trim() || `${name.trim()} — managed by Bonsai`,
            private: visibility !== "public",
            auto_init: true,
          }),
        });
        if (createRes.ok) {
          const repo = await createRes.json();
          finalSlug = repo.name;
          githubRepo = repo.name;
        } else {
          const err = await createRes.json().catch(() => ({}));
          return NextResponse.json(
            { error: err.message || "Failed to create GitHub repository" },
            { status: createRes.status }
          );
        }
      } else if (repoCheckRes.ok) {
        githubRepo = slug;
      }

      // Clone repo into {projectDir}/repo/ subdirectory
      const projectDir = path.join(PROJECTS_DIR, finalSlug);
      const repoPath = path.join(projectDir, "repo");

      if (githubRepo && !fs.existsSync(repoPath)) {
        fs.mkdirSync(projectDir, { recursive: true });
        try {
          const cloneUrl = `https://${token}@github.com/${githubOwner}/${githubRepo}.git`;
          execFileSync("git", ["clone", cloneUrl, "repo"], {
            cwd: projectDir,
            timeout: 30000,
          });
        } catch (err: unknown) {
          console.error("[POST /api/projects] clone failed:", err);
        }
      }
    }
  }

  const localPath = path.join(PROJECTS_DIR, finalSlug);
  const repoDir = path.join(localPath, "repo");
  const worktreesDir = path.join(localPath, "worktrees");

  // Ensure project directory and worktrees directory exist
  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(localPath, { recursive: true });
  }
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // CRITICAL VERIFICATION: Ensure repo/ directory exists with .git
  if (!fs.existsSync(repoDir)) {
    throw new Error(
      `FATAL: Project structure violation - repo/ directory missing at ${repoDir}. ` +
      `Projects MUST have structure: {projectDir}/repo/ (git repo) and {projectDir}/worktrees/ (ticket worktrees).`
    );
  }
  const gitDir = path.join(repoDir, ".git");
  if (!fs.existsSync(gitDir)) {
    throw new Error(
      `FATAL: Project structure violation - repo/ is not a git repository at ${repoDir}. ` +
      `The repo/ directory MUST contain a valid git repository.`
    );
  }

  try {
    const project = await createProject({
      name: name.trim(),
      slug: finalSlug,
      visibility: visibility || "private",
      description: description?.trim() || undefined,
      localPath,
      githubOwner,
      githubRepo,
    });
    return NextResponse.json({ success: true, project });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/projects] createProject failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const allProjects = await getProjects();
  return NextResponse.json({ projects: allProjects });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, string | null> = {};
  if (body.name?.trim()) updates.name = body.name.trim();
  if ("description" in body) updates.description = body.description?.trim() || "";
  if ("targetCustomer" in body) updates.targetCustomer = body.targetCustomer?.trim() || "";
  if ("techStack" in body) updates.techStack = body.techStack?.trim() || "";
  if ("buildCommand" in body) updates.buildCommand = body.buildCommand?.trim() || null;
  if ("runCommand" in body) updates.runCommand = body.runCommand?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await updateProject(Number(id), updates);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "Project id is required" }, { status: 400 });
  }

  // Fetch project to get GitHub details before deleting
  const { getProjectById } = await import("@/db/data/projects");
  const project = await getProjectById(Number(id));

  // Delete GitHub repo if it exists
  if (project?.githubOwner && project?.githubRepo) {
    const token = await getGithubToken();
    if (token) {
      try {
        const res = await githubFetch(
          `/repos/${project.githubOwner}/${project.githubRepo}`,
          token,
          { method: "DELETE" }
        );
        if (!res.ok && res.status !== 404) {
          console.error("[DELETE /api/projects] GitHub repo deletion failed:", res.status);
        }
      } catch (err) {
        console.error("[DELETE /api/projects] GitHub repo deletion error:", err);
      }
    }
  }

  // Remove local clone directory
  if (project?.localPath) {
    try {
      fs.rmSync(project.localPath, { recursive: true, force: true });
    } catch {
      // Directory may not exist — that's fine
    }
  }

  // Delete associated resources to prevent orphans
  const { db } = await import("@/db/index");
  const { personas, tickets } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  // Delete tickets first (they may reference personas)
  db.delete(tickets).where(eq(tickets.project_id, Number(id))).run();
  // Delete personas
  db.delete(personas).where(eq(personas.project_id, Number(id))).run();

  await softDeleteProject(Number(id));
  return NextResponse.json({ success: true });
}

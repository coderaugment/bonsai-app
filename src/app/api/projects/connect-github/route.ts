import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
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
  const { projectId, repoName } = await req.json();
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const token = await getGithubToken();
  if (!token) {
    return NextResponse.json({ error: "GitHub token not configured" }, { status: 401 });
  }

  // Get authenticated user
  const userRes = await githubFetch("/user", token);
  if (!userRes.ok) {
    return NextResponse.json({ error: "Failed to authenticate with GitHub" }, { status: 401 });
  }
  const githubUser = await userRes.json();
  const owner = githubUser.login;

  // Get project from DB for the slug
  const project = db.select().from(projects).where(eq(projects.id, Number(projectId))).get();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const slug = repoName?.trim() || project.slug;

  // Check if repo exists
  const repoCheckRes = await githubFetch(`/repos/${owner}/${slug}`, token);
  let finalRepoName = slug;

  if (repoCheckRes.status === 404) {
    // Create new repo
    const createRes = await githubFetch("/user/repos", token, {
      method: "POST",
      body: JSON.stringify({
        name: slug,
        description: `${project.name} — managed by Bonsai`,
        private: true,
        auto_init: true,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.message || "Failed to create GitHub repository" },
        { status: createRes.status }
      );
    }

    const repo = await createRes.json();
    finalRepoName = repo.name;
  } else if (!repoCheckRes.ok) {
    return NextResponse.json(
      { error: "Failed to check if repository exists on GitHub" },
      { status: repoCheckRes.status }
    );
  }

  // Clone repo into local projects directory
  const localPath = path.join(PROJECTS_DIR, finalRepoName);
  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    try {
      const cloneUrl = `https://${token}@github.com/${owner}/${finalRepoName}.git`;
      execFileSync("git", ["clone", cloneUrl, finalRepoName], {
        cwd: PROJECTS_DIR,
        timeout: 30000,
      });
    } catch (err: unknown) {
      console.error("[connect-github] clone failed:", err);
    }
  }

  // Update project with GitHub info and local path
  db.update(projects)
    .set({ githubOwner: owner, githubRepo: finalRepoName, slug: finalRepoName, localPath })
    .where(eq(projects.id, Number(projectId)))
    .run();

  return NextResponse.json({ success: true, owner, repo: finalRepoName, localPath });
}

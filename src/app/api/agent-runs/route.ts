import { NextResponse } from "next/server";
import { getAgentRuns, clearFinishedAgentRuns } from "@/db/data/agent-runs";
import { getProjectBySlug } from "@/db/data/projects";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200);

  let projectId: number | undefined;
  const projectIdParam = url.searchParams.get("projectId");
  const projectSlugParam = url.searchParams.get("projectSlug");

  if (projectIdParam) {
    projectId = Number(projectIdParam);
  } else if (projectSlugParam) {
    const project = await getProjectBySlug(projectSlugParam);
    if (project) projectId = Number(project.id);
  }

  const runs = await getAgentRuns(limit, projectId);
  return NextResponse.json(runs);
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const projectSlugParam = url.searchParams.get("projectSlug");
  const projectIdParam = url.searchParams.get("projectId");

  let projectId: number | undefined;
  if (projectIdParam) {
    projectId = Number(projectIdParam);
  } else if (projectSlugParam) {
    const project = await getProjectBySlug(projectSlugParam);
    if (project) projectId = Number(project.id);
  }

  await clearFinishedAgentRuns(projectId);
  return NextResponse.json({ ok: true });
}

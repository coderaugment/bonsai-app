import { db, asAsync, runAsync } from "./_driver";
import { projects, tickets } from "../schema";
import { eq, and, or, isNull } from "drizzle-orm";
import type { Project } from "@/types";
import { getSetting } from "./settings";

function projectFromRow(row: typeof projects.$inferSelect): Project {
  const count = db
    .select()
    .from(tickets)
    .where(eq(tickets.projectId, row.id))
    .all().length;

  return {
    id: String(row.id),
    name: row.name,
    slug: row.githubRepo ?? row.slug,
    description: row.description ?? undefined,
    targetCustomer: row.targetCustomer ?? undefined,
    techStack: row.techStack ?? undefined,
    visibility: row.visibility ?? undefined,
    ticketCount: count,
    githubOwner: row.githubOwner ?? undefined,
    githubRepo: row.githubRepo ?? undefined,
    localPath: row.localPath ?? undefined,
    buildCommand: row.buildCommand ?? undefined,
    runCommand: row.runCommand ?? undefined,
  };
}

export async function getProject(): Promise<Project | null> {
  const notDeleted = isNull(projects.deletedAt);
  const activeId = await getSetting("active_project_id");
  const row = activeId
    ? db
        .select()
        .from(projects)
        .where(and(eq(projects.id, Number(activeId)), notDeleted))
        .get() ??
      db.select().from(projects).where(notDeleted).limit(1).get()
    : db.select().from(projects).where(notDeleted).limit(1).get();
  if (!row) return null;
  return projectFromRow(row);
}

export function getProjectById(id: number) {
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  return asAsync(row ?? null);
}

export function getProjectBySlug(slug: string): Promise<Project | null> {
  const row = db
    .select()
    .from(projects)
    .where(
      and(
        or(eq(projects.githubRepo, slug), eq(projects.slug, slug)),
        isNull(projects.deletedAt)
      )
    )
    .get();
  if (!row) return asAsync(null);
  return asAsync(projectFromRow(row));
}

export function getProjects(): Promise<Project[]> {
  const rows = db
    .select()
    .from(projects)
    .where(isNull(projects.deletedAt))
    .all()
    .map(projectFromRow);
  return asAsync(rows);
}

export function createProject(data: {
  name: string;
  slug: string;
  visibility: "public" | "private";
  description?: string;
  githubOwner?: string;
  githubRepo?: string;
  localPath?: string;
}) {
  const row = db
    .insert(projects)
    .values(data)
    .onConflictDoUpdate({
      target: projects.slug,
      set: {
        name: data.name,
        visibility: data.visibility,
        description: data.description,
        githubOwner: data.githubOwner,
        githubRepo: data.githubRepo,
        localPath: data.localPath,
      },
    })
    .returning()
    .get();
  return asAsync(row);
}

export function updateProject(
  id: number,
  data: Record<string, string | null>
): Promise<void> {
  return runAsync(() => {
    db.update(projects).set(data).where(eq(projects.id, id)).run();
  });
}

export function softDeleteProject(id: number): Promise<void> {
  return runAsync(() => {
    db.update(projects)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(projects.id, id))
      .run();
  });
}

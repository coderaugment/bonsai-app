import { db } from ".";
import { eq, or, sql, desc, and, isNull, lt, asc } from "drizzle-orm";
import { projects, personas, tickets, settings, users, comments, ticketDocuments } from "./schema";
import type { Ticket, Persona, Project, WorkerRole } from "@/types";
import { workerRoles } from "@/lib/worker-types";

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

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
    ticketCount: count,
    githubOwner: row.githubOwner ?? undefined,
    githubRepo: row.githubRepo ?? undefined,
  };
}

export function getProject(): Project | null {
  const activeId = getSetting("active_project_id");
  const row = activeId
    ? db.select().from(projects).where(eq(projects.id, Number(activeId))).get()
      ?? db.select().from(projects).limit(1).get()
    : db.select().from(projects).limit(1).get();
  if (!row) return null;
  return projectFromRow(row);
}

export function getProjectBySlug(slug: string): Project | null {
  const row = db
    .select()
    .from(projects)
    .where(or(eq(projects.githubRepo, slug), eq(projects.slug, slug)))
    .get();
  if (!row) return null;
  return projectFromRow(row);
}

export function getProjects(): Project[] {
  return db.select().from(projects).all().map(projectFromRow);
}

export function getPersonas(projectId?: number): Persona[] {
  // Personas are company-wide (projectId = NULL) — always include them.
  // If a projectId is given, also include any project-specific personas.
  const rows = projectId
    ? db.select().from(personas).where(
        or(eq(personas.projectId, projectId), isNull(personas.projectId))
      ).all()
    : db.select().from(personas).all();

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    color: r.color,
    avatar: r.avatar ?? undefined,
    roleId: r.roleId ?? undefined,
    role: r.role ?? "developer",
    personality: r.personality ?? undefined,
    skills: safeJsonParse<string[]>(r.skills, []),
    processes: safeJsonParse<string[]>(r.processes, []),
    goals: safeJsonParse<string[]>(r.goals, []),
    permissions: safeJsonParse<{ tools: string[]; folders: string[] }>(
      r.permissions,
      { tools: [], folders: [] }
    ),
    projectId: r.projectId ?? undefined,
  }));
}

export function getTickets(projectId?: number): Ticket[] {
  const rows = projectId
    ? db.select().from(tickets).where(eq(tickets.projectId, projectId)).all()
    : db.select().from(tickets).all();

  const personaMap = new Map(
    getPersonas(projectId).map((p) => [p.id, p])
  );

  // Build creator lookup from users table
  const creatorIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as number[];
  const creatorMap = new Map<number, { name: string; avatarUrl?: string }>();
  for (const uid of creatorIds) {
    const u = db.select().from(users).where(eq(users.id, uid)).get();
    if (u) creatorMap.set(uid, { name: u.name, avatarUrl: u.avatarUrl ?? undefined });
  }

  return rows.map((r) => {
    // Collect all unique personas who have interacted with this ticket
    const participantIds = new Set<string>();
    if (r.assigneeId) participantIds.add(r.assigneeId);
    if (r.researchCompletedBy) participantIds.add(r.researchCompletedBy);
    if (r.planCompletedBy) participantIds.add(r.planCompletedBy);
    const participants = [...participantIds]
      .map((id) => personaMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p != null);

    return {
      id: r.id,
      title: r.title,
      description: r.description ?? "",
      type: r.type,
      state: r.state,
      priority: r.priority,
      assignee: r.assigneeId ? personaMap.get(r.assigneeId) : undefined,
      creator: r.createdBy ? creatorMap.get(r.createdBy) : undefined,
      acceptanceCriteria: r.acceptanceCriteria ?? undefined,
      commentCount: r.commentCount ?? 0,
      hasAttachments: r.hasAttachments ?? false,
      lastAgentActivity: r.lastAgentActivity ?? undefined,
      createdAt: r.createdAt ?? "",
      // Lifecycle tracking
      researchCompletedAt: r.researchCompletedAt ?? undefined,
      researchCompletedBy: r.researchCompletedBy ?? undefined,
      researchApprovedAt: r.researchApprovedAt ?? undefined,
      researchApprovedBy: r.researchApprovedBy ?? undefined,
      planCompletedAt: r.planCompletedAt ?? undefined,
      planCompletedBy: r.planCompletedBy ?? undefined,
      planApprovedAt: r.planApprovedAt ?? undefined,
      planApprovedBy: r.planApprovedBy ?? undefined,
      lastHumanCommentAt: r.lastHumanCommentAt ?? undefined,
      returnedFromVerification: r.returnedFromVerification ?? false,
      participants,
    };
  });
}

export function getSetting(key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function getUser() {
  return db.select().from(users).limit(1).get() ?? null;
}

export function createUser(name: string) {
  return db.insert(users).values({ name }).returning().get();
}

export function createProject(data: {
  name: string;
  slug: string;
  visibility: "public" | "private";
  description?: string;
  githubOwner?: string;
  githubRepo?: string;
}) {
  return db
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
      },
    })
    .returning()
    .get();
}

export function createPersona(data: {
  name: string;
  role: string;
  color?: string;
  roleId?: number;
  personality?: string;
  skills: string[];
  processes: string[];
  goals: string[];
  permissions: { tools: string[]; folders: string[] };
  projectId?: number;
  avatar?: string;
}) {
  // Generate unique ID: find max existing p{N} and increment
  const allIds = db.select({ id: personas.id }).from(personas).all();
  const maxNum = allIds
    .map((r) => parseInt(r.id.replace("p", ""), 10))
    .filter((n) => !isNaN(n))
    .reduce((max, n) => Math.max(max, n), 0);
  const id = `p${maxNum + 1}`;
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Use provided color, or look up from workerRoles for legacy roles, or default
  const color = data.color
    || (workerRoles[data.role as WorkerRole]?.color)
    || "#6366f1";

  // Company-wide personas have NULL projectId by default
  const projectId = data.projectId ?? null;

  return db
    .insert(personas)
    .values({
      id,
      name: data.name,
      slug,
      color,
      role: data.role,
      roleId: data.roleId ?? null,
      personality: data.personality || null,
      skills: JSON.stringify(data.skills),
      processes: JSON.stringify(data.processes),
      goals: JSON.stringify(data.goals),
      permissions: JSON.stringify(data.permissions),
      avatar: data.avatar || null,
      projectId,
    })
    .returning()
    .get();
}

// ── Prompt Builder Queries ──────────────────────

export function getCommentsByTicket(ticketId: string, limit: number = 10) {
  return db
    .select()
    .from(comments)
    .where(eq(comments.ticketId, ticketId))
    .orderBy(desc(comments.createdAt))
    .limit(limit)
    .all();
}

export function getTicketDocumentsByTicket(ticketId: string) {
  return db
    .select()
    .from(ticketDocuments)
    .where(eq(ticketDocuments.ticketId, ticketId))
    .orderBy(desc(ticketDocuments.version))
    .all();
}

export function getTicketById(id: string) {
  return db
    .select()
    .from(tickets)
    .where(eq(tickets.id, id))
    .get();
}

// ── Worktree Management ──────────────────────

export function setTicketWorktree(
  ticketId: string,
  worktreePath: string
): void {
  db
    .update(tickets)
    .set({ worktreePath })
    .where(eq(tickets.id, ticketId))
    .run();
}

export function clearTicketWorktree(ticketId: string): void {
  db
    .update(tickets)
    .set({ worktreePath: null })
    .where(eq(tickets.id, ticketId))
    .run();
}

export function getTicketWorktree(ticketId: string): string | null {
  const result = db
    .select({ worktreePath: tickets.worktreePath })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();

  return result?.worktreePath ?? null;
}

// ── Work Scheduler ──────────────────────

export function getNextTicket(personaId?: string): typeof tickets.$inferSelect | null {
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

  // Build base filters
  const baseFilters = [
    // Exclude tickets with recent agent activity (locked)
    or(
      isNull(tickets.lastAgentActivity),
      lt(tickets.lastAgentActivity, thirtyMinutesAgo)
    ),
    // Exclude done tickets
    sql`${tickets.state} != 'done'`,
  ];

  // Add persona filter if specified
  if (personaId) {
    baseFilters.push(eq(tickets.assigneeId, personaId));
  }

  // Priority 1: Human waiting (has lastHumanCommentAt set)
  const humanWaiting = db
    .select()
    .from(tickets)
    .where(and(...baseFilters, sql`${tickets.lastHumanCommentAt} IS NOT NULL`))
    .orderBy(desc(tickets.priority), asc(tickets.createdAt))
    .limit(1)
    .get();

  if (humanWaiting) return humanWaiting;

  // Priority 2: Returned from verification
  const returnedFromVerification = db
    .select()
    .from(tickets)
    .where(and(...baseFilters, eq(tickets.returnedFromVerification, true)))
    .orderBy(desc(tickets.priority), asc(tickets.createdAt))
    .limit(1)
    .get();

  if (returnedFromVerification) return returnedFromVerification;

  // Priority 3: In progress (already working on)
  const inProgress = db
    .select()
    .from(tickets)
    .where(and(...baseFilters, eq(tickets.state, "in_progress")))
    .orderBy(desc(tickets.priority), asc(tickets.createdAt))
    .limit(1)
    .get();

  if (inProgress) return inProgress;

  // Priority 4: Backlog (new work)
  const backlog = db
    .select()
    .from(tickets)
    .where(and(...baseFilters, eq(tickets.state, "backlog")))
    .orderBy(desc(tickets.priority), asc(tickets.createdAt))
    .limit(1)
    .get();

  return backlog || null;
}

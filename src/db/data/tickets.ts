import { db, asAsync, runAsync } from "./_driver";
import { tickets, users, personas } from "../schema";
import {
  eq,
  sql,
  desc,
  and,
  isNull,
  lt,
  asc,
  or,
} from "drizzle-orm";
import type { Ticket, Persona } from "@/types";

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function personaFromRow(row: typeof personas.$inferSelect): Persona {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    avatar: row.avatar ?? undefined,
    roleId: row.roleId ?? undefined,
    role: row.role ?? "developer",
    personality: row.personality ?? undefined,
    skills: safeJsonParse<string[]>(row.skills, []),
    processes: safeJsonParse<string[]>(row.processes, []),
    goals: safeJsonParse<string[]>(row.goals, []),
    permissions: safeJsonParse<{ tools: string[]; folders: string[] }>(
      row.permissions,
      { tools: [], folders: [] }
    ),
    projectId: row.projectId ?? undefined,
  };
}

export function getTickets(projectId?: number): Promise<Ticket[]> {
  const rows = projectId
    ? db
        .select()
        .from(tickets)
        .where(
          and(eq(tickets.projectId, projectId), isNull(tickets.deletedAt))
        )
        .all()
    : db
        .select()
        .from(tickets)
        .where(isNull(tickets.deletedAt))
        .all();

  // Build persona map
  const personaRows = projectId
    ? db
        .select()
        .from(personas)
        .where(
          and(eq(personas.projectId, projectId), isNull(personas.deletedAt))
        )
        .all()
    : db
        .select()
        .from(personas)
        .where(isNull(personas.deletedAt))
        .all();
  const personaMap = new Map(
    personaRows.map((p) => [p.id, personaFromRow(p)])
  );

  // Build creator map
  const creatorIds = [
    ...new Set(rows.map((r) => r.createdBy).filter(Boolean)),
  ] as number[];
  const creatorMap = new Map<number, { name: string; avatarUrl?: string }>();
  for (const uid of creatorIds) {
    const u = db.select().from(users).where(eq(users.id, uid)).get();
    if (u)
      creatorMap.set(uid, {
        name: u.name,
        avatarUrl: u.avatarUrl ?? undefined,
      });
  }

  // Compute epic metadata: child counts and epic titles
  const epicChildStats = new Map<number, { total: number; shipped: number }>();
  const epicTitleMap = new Map<number, string>();
  for (const r of rows) {
    if (r.isEpic) epicTitleMap.set(r.id, r.title);
    if (r.epicId) {
      const stats = epicChildStats.get(r.epicId) ?? { total: 0, shipped: 0 };
      stats.total++;
      if (r.state === "shipped") stats.shipped++;
      epicChildStats.set(r.epicId, stats);
    }
  }

  const result = rows.map((r) => {
    const participantIds = new Set<string>();
    if (r.assigneeId) participantIds.add(r.assigneeId);
    if (r.researchCompletedBy) participantIds.add(r.researchCompletedBy);
    if (r.planCompletedBy) participantIds.add(r.planCompletedBy);
    const participants = [...participantIds]
      .map((id) => personaMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p != null);

    const childStats = epicChildStats.get(r.id);

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
      mergedAt: r.mergedAt ?? undefined,
      mergeCommit: r.mergeCommit ?? undefined,
      isEpic: r.isEpic ?? false,
      epicId: r.epicId ?? undefined,
      epicTitle: r.epicId ? epicTitleMap.get(r.epicId) : undefined,
      childCount: childStats?.total ?? 0,
      childrenShipped: childStats?.shipped ?? 0,
      participants,
    } as Ticket;
  });

  return asAsync(result);
}

export function getTicketById(id: number) {
  const row = db.select().from(tickets).where(eq(tickets.id, id)).get();
  return asAsync(row ?? null);
}

export function createTicket(data: {
  title: string;
  type: "feature" | "bug" | "chore";
  state: "review" | "planning" | "building" | "test" | "shipped";
  description?: string | null;
  acceptanceCriteria?: string | null;
  priority: number;
  projectId: number;
  createdBy?: number | null;
  commentCount?: number;
  hasAttachments?: boolean;
  isEpic?: boolean;
  epicId?: number | null;
}) {
  const row = db
    .insert(tickets)
    .values({
      title: data.title,
      type: data.type,
      state: data.state,
      description: data.description ?? null,
      acceptanceCriteria: data.acceptanceCriteria ?? null,
      priority: data.priority,
      projectId: data.projectId,
      createdBy: data.createdBy ?? null,
      commentCount: data.commentCount ?? 0,
      hasAttachments: data.hasAttachments ?? false,
      isEpic: data.isEpic ?? false,
      epicId: data.epicId ?? null,
    })
    .returning()
    .get();
  return asAsync(row);
}

export function updateTicket(
  ticketId: number,
  data: Record<string, unknown>
): Promise<void> {
  return runAsync(() => {
    db.update(tickets).set(data).where(eq(tickets.id, ticketId)).run();
  });
}

export function softDeleteTicket(ticketId: number): Promise<void> {
  return runAsync(() => {
    db.update(tickets)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(tickets.id, ticketId))
      .run();
  });
}

export function getTicketCount(): Promise<number> {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .get();
  return asAsync(row?.count ?? 0);
}

export function hasTickets(): Promise<boolean> {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .get();
  return asAsync((row?.count ?? 0) > 0);
}

export function setTicketWorktree(
  ticketId: number,
  worktreePath: string
): Promise<void> {
  return runAsync(() => {
    db.update(tickets)
      .set({ worktreePath })
      .where(eq(tickets.id, ticketId))
      .run();
  });
}

export function clearTicketWorktree(ticketId: number): Promise<void> {
  return runAsync(() => {
    db.update(tickets)
      .set({ worktreePath: null })
      .where(eq(tickets.id, ticketId))
      .run();
  });
}

export function getTicketWorktree(
  ticketId: number
): Promise<string | null> {
  const result = db
    .select({ worktreePath: tickets.worktreePath })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();
  return asAsync(result?.worktreePath ?? null);
}

export function getNextTicket(
  personaId?: string
): Promise<typeof tickets.$inferSelect | null> {
  const now = new Date();
  const thirtyMinutesAgo = new Date(
    now.getTime() - 30 * 60 * 1000
  ).toISOString();

  const baseFilters = [
    or(
      isNull(tickets.lastAgentActivity),
      lt(tickets.lastAgentActivity, thirtyMinutesAgo)
    ),
    sql`${tickets.state} != 'review'`,
    sql`${tickets.state} != 'shipped'`,
    eq(tickets.isEpic, false),
  ];

  if (personaId) {
    baseFilters.push(eq(tickets.assigneeId, personaId));
  }

  const humanWaiting = db
    .select()
    .from(tickets)
    .where(
      and(
        ...baseFilters,
        sql`${tickets.lastHumanCommentAt} IS NOT NULL`
      )
    )
    .orderBy(desc(tickets.priority), asc(tickets.createdAt))
    .limit(1)
    .get();

  if (humanWaiting) return asAsync(humanWaiting);

  const returnedFromVerification = db
    .select()
    .from(tickets)
    .where(
      and(...baseFilters, eq(tickets.returnedFromVerification, true))
    )
    .orderBy(desc(tickets.priority), asc(tickets.createdAt))
    .limit(1)
    .get();

  if (returnedFromVerification) return asAsync(returnedFromVerification);

  const inProgress = db
    .select()
    .from(tickets)
    .where(and(...baseFilters, eq(tickets.state, "building")))
    .orderBy(desc(tickets.priority), asc(tickets.createdAt))
    .limit(1)
    .get();

  if (inProgress) return asAsync(inProgress);

  const backlog = db
    .select()
    .from(tickets)
    .where(and(...baseFilters, eq(tickets.state, "planning")))
    .orderBy(desc(tickets.priority), asc(tickets.createdAt))
    .limit(1)
    .get();

  return asAsync(backlog || null);
}

export function getEpicChildren(epicId: number) {
  const rows = db
    .select()
    .from(tickets)
    .where(and(eq(tickets.epicId, epicId), isNull(tickets.deletedAt)))
    .all();
  return asAsync(rows);
}

export function getEpics(projectId?: number) {
  const filters = [eq(tickets.isEpic, true), isNull(tickets.deletedAt)];
  if (projectId) filters.push(eq(tickets.projectId, projectId));
  const rows = db
    .select()
    .from(tickets)
    .where(and(...filters))
    .all();
  return asAsync(rows);
}

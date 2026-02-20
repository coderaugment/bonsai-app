import { db, asAsync, runAsync } from "./_driver";
import { personas, roles } from "../schema";
import { eq, and, isNull } from "drizzle-orm";
import type { Persona, WorkerRole } from "@/types";
import { workerRoles } from "@/lib/worker-types";

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

export function getPersonas(projectId?: number): Promise<Persona[]> {
  const rows = projectId
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
  return asAsync(rows.map(personaFromRow));
}

export function getPersona(personaId: string): Promise<Persona | null> {
  const row = db
    .select()
    .from(personas)
    .where(and(eq(personas.id, personaId), isNull(personas.deletedAt)))
    .get();
  if (!row) return asAsync(null);
  return asAsync(personaFromRow(row));
}

/** Raw DB row — used by dispatch/agent-complete which need schema-level fields */
export function getPersonaRaw(personaId: string) {
  const row = db
    .select()
    .from(personas)
    .where(eq(personas.id, personaId))
    .get();
  return asAsync(row ?? null);
}

/** Get all non-deleted personas for a project (raw rows for dispatch) */
export function getProjectPersonasRaw(projectId: number) {
  const rows = db
    .select()
    .from(personas)
    .where(and(eq(personas.projectId, projectId), isNull(personas.deletedAt)))
    .all();
  return asAsync(rows);
}

/** Get all non-deleted personas (raw rows, no project filter) */
export function getAllPersonasRaw() {
  const rows = db
    .select()
    .from(personas)
    .where(isNull(personas.deletedAt))
    .all();
  return asAsync(rows);
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
  const allIds = db.select({ id: personas.id }).from(personas).all();
  const maxNum = allIds
    .map((r) => parseInt(r.id.replace("p", ""), 10))
    .filter((n) => !isNaN(n))
    .reduce((max, n) => Math.max(max, n), 0);
  const id = `p${maxNum + 1}`;
  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const color =
    data.color ||
    workerRoles[data.role as WorkerRole]?.color ||
    "#6366f1";

  const projectId = data.projectId ?? null;

  const row = db
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
  return asAsync(row);
}

export function updatePersona(
  id: string,
  data: Record<string, unknown>
) {
  const row = db
    .update(personas)
    .set(data)
    .where(eq(personas.id, id))
    .returning()
    .get();
  return asAsync(row);
}

export function softDeletePersona(id: string): Promise<void> {
  return runAsync(() => {
    db.update(personas)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(personas.id, id))
      .run();
  });
}

export function getPersonasByRole(
  role: string,
  opts?: { projectId?: number }
) {
  const filters = [eq(personas.role, role), isNull(personas.deletedAt)];
  if (opts?.projectId) {
    filters.push(eq(personas.projectId, opts.projectId));
  }
  const rows = db
    .select()
    .from(personas)
    .where(and(...filters))
    .all();
  return asAsync(rows);
}

export function isTeamComplete(projectId?: number): Promise<boolean> {
  // ONLY CHECK FOR ENABLED ROLES: lead, researcher, developer
  const enabledRoleSlugs = ["lead", "researcher", "developer"];
  const allRoles = db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .all()
    .filter((r) => enabledRoleSlugs.includes(r.slug));

  if (allRoles.length === 0) return asAsync(false);
  const personaQuery = projectId
    ? db
        .select({ roleId: personas.roleId })
        .from(personas)
        .where(
          and(eq(personas.projectId, projectId), isNull(personas.deletedAt))
        )
        .all()
    : db
        .select({ roleId: personas.roleId })
        .from(personas)
        .where(isNull(personas.deletedAt))
        .all();
  const filledRoleIds = new Set(
    personaQuery.map((r) => r.roleId).filter(Boolean)
  );
  return asAsync(allRoles.every((r) => filledRoleIds.has(r.id)));
}

export function getRoleColorById(roleId: number): Promise<string | null> {
  const row = db.select().from(roles).where(eq(roles.id, roleId)).get();
  return asAsync(row?.color ?? null);
}

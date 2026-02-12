import { db, asAsync, runAsync } from "./_driver";
import { roles, roleSkills, skills } from "../schema";
import { eq, inArray } from "drizzle-orm";

function parseRoleJsonFields(role: typeof roles.$inferSelect) {
  return {
    ...role,
    workflow: role.workflow ? JSON.parse(role.workflow) : [],
    tools: role.tools ? JSON.parse(role.tools) : [],
    folderAccess: role.folderAccess ? JSON.parse(role.folderAccess) : [],
    skillDefinitions: role.skillDefinitions
      ? JSON.parse(role.skillDefinitions)
      : [],
  };
}

function getSkillsForRole(roleId: number) {
  const roleSkillRows = db
    .select({ skillId: roleSkills.skillId })
    .from(roleSkills)
    .where(eq(roleSkills.roleId, roleId))
    .all();
  const skillIds = roleSkillRows.map((rs) => rs.skillId);
  if (skillIds.length === 0) return [];
  return db
    .select()
    .from(skills)
    .where(inArray(skills.id, skillIds))
    .all();
}

export function getRoles() {
  const allRoles = db.select().from(roles).all();
  const result = allRoles.map((role) => ({
    ...parseRoleJsonFields(role),
    skills: getSkillsForRole(role.id),
  }));
  return asAsync(result);
}

export function getRoleBySlug(slug: string) {
  const row = db.select().from(roles).where(eq(roles.slug, slug)).get();
  return asAsync(row ?? null);
}

export function getRoleById(id: number) {
  const row = db.select().from(roles).where(eq(roles.id, id)).get();
  return asAsync(row ?? null);
}

export function createRole(data: {
  slug: string;
  title: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  workflow?: unknown;
  systemPrompt?: string | null;
  tools?: unknown;
  folderAccess?: unknown;
  skillDefinitions?: unknown;
  skillIds?: number[];
}) {
  const result = db
    .insert(roles)
    .values({
      slug: data.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_"),
      title: data.title.trim(),
      description: data.description ?? null,
      color: data.color || "#6366f1",
      icon: data.icon ?? null,
      workflow: data.workflow ? JSON.stringify(data.workflow) : null,
      systemPrompt: data.systemPrompt ?? null,
      tools: data.tools ? JSON.stringify(data.tools) : null,
      folderAccess: data.folderAccess
        ? JSON.stringify(data.folderAccess)
        : null,
      skillDefinitions: data.skillDefinitions
        ? JSON.stringify(data.skillDefinitions)
        : null,
    })
    .returning()
    .get();

  if (data.skillIds && data.skillIds.length > 0) {
    for (const skillId of data.skillIds) {
      db.insert(roleSkills)
        .values({ roleId: result.id, skillId })
        .run();
    }
  }

  return asAsync({
    ...parseRoleJsonFields(result),
    skills: getSkillsForRole(result.id),
  });
}

export function updateRole(
  id: number,
  data: {
    slug?: string;
    title?: string;
    description?: string | null;
    color?: string;
    icon?: string | null;
    workflow?: unknown;
    systemPrompt?: string | null;
    tools?: unknown;
    folderAccess?: unknown;
    skillDefinitions?: unknown;
    skillIds?: number[];
  }
) {
  const result = db
    .update(roles)
    .set({
      ...(data.slug && {
        slug: data.slug
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_"),
      }),
      ...(data.title && { title: data.title.trim() }),
      ...(data.description !== undefined && {
        description: data.description ?? null,
      }),
      ...(data.color && { color: data.color }),
      ...(data.icon !== undefined && { icon: data.icon ?? null }),
      ...(data.workflow !== undefined && {
        workflow: data.workflow ? JSON.stringify(data.workflow) : null,
      }),
      ...(data.systemPrompt !== undefined && {
        systemPrompt: data.systemPrompt ?? null,
      }),
      ...(data.tools !== undefined && {
        tools: data.tools ? JSON.stringify(data.tools) : null,
      }),
      ...(data.folderAccess !== undefined && {
        folderAccess: data.folderAccess
          ? JSON.stringify(data.folderAccess)
          : null,
      }),
      ...(data.skillDefinitions !== undefined && {
        skillDefinitions: data.skillDefinitions
          ? JSON.stringify(data.skillDefinitions)
          : null,
      }),
    })
    .where(eq(roles.id, id))
    .returning()
    .get();

  if (data.skillIds !== undefined) {
    db.delete(roleSkills).where(eq(roleSkills.roleId, id)).run();
    for (const skillId of data.skillIds) {
      db.insert(roleSkills).values({ roleId: id, skillId }).run();
    }
  }

  return asAsync({
    ...parseRoleJsonFields(result),
    skills: getSkillsForRole(id),
  });
}

export function deleteRole(id: number): Promise<void> {
  return runAsync(() => {
    db.delete(roles).where(eq(roles.id, id)).run();
  });
}

// ── Skills CRUD ──────────────────────────────────────

export function getSkills() {
  const rows = db.select().from(skills).all();
  return asAsync(rows);
}

export function createSkill(data: {
  name: string;
  description?: string | null;
  category?: "technical" | "communication" | "planning" | "analysis" | "creative" | null;
}) {
  const row = db
    .insert(skills)
    .values({
      name: data.name.trim(),
      description: data.description ?? null,
      category: data.category ?? null,
    })
    .returning()
    .get();
  return asAsync(row);
}

export function updateSkill(
  id: number,
  data: {
    name?: string;
    description?: string | null;
    category?: "technical" | "communication" | "planning" | "analysis" | "creative" | null;
  }
) {
  const row = db
    .update(skills)
    .set({
      ...(data.name && { name: data.name.trim() }),
      ...(data.description !== undefined && {
        description: data.description ?? null,
      }),
      ...(data.category !== undefined && {
        category: data.category ?? null,
      }),
    })
    .where(eq(skills.id, id))
    .returning()
    .get();
  return asAsync(row);
}

export function deleteSkill(id: number): Promise<void> {
  return runAsync(() => {
    db.delete(skills).where(eq(skills.id, id)).run();
  });
}

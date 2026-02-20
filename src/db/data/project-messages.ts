import { db, asAsync } from "./_driver";
import { projectMessages, personas, settings } from "../schema";
import { eq, desc } from "drizzle-orm";

/** Fetch project messages with author enrichment */
export function getProjectMessages(projectId: number, limit: number = 100) {
  const rows = db
    .select()
    .from(projectMessages)
    .where(eq(projectMessages.projectId, projectId))
    .orderBy(desc(projectMessages.createdAt))
    .limit(limit)
    .all()
    .reverse(); // oldest first for chat display

  // Get user name from settings once for all human messages
  const userName =
    db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "user_name"))
      .get()?.value ?? "User";

  const enriched = rows.map((row) => {
    let author:
      | { name: string; avatarUrl?: string; color?: string; role?: string }
      | undefined;

    if (row.authorType === "human") {
      author = { name: userName };
    } else if (row.authorType === "agent" && row.personaId) {
      const persona = db
        .select()
        .from(personas)
        .where(eq(personas.id, row.personaId))
        .get();
      if (persona) {
        author = {
          name: persona.name,
          avatarUrl: persona.avatar || undefined,
          color: persona.color,
          role: persona.role || undefined,
        };
      }
    }

    let attachments;
    try {
      attachments = row.attachments ? JSON.parse(row.attachments) : undefined;
    } catch {
      attachments = undefined;
    }

    return {
      id: row.id,
      projectId: row.projectId,
      authorType: row.authorType,
      author,
      content: row.content,
      attachments,
      createdAt: row.createdAt,
    };
  });

  return asAsync(enriched);
}

/** Create a project message */
export function createProjectMessage(data: {
  projectId: number;
  authorType: "human" | "agent" | "system";
  authorId?: number | null;
  personaId?: string | null;
  content: string;
  attachments?: string | null;
}) {
  const row = db
    .insert(projectMessages)
    .values({
      projectId: data.projectId,
      authorType: data.authorType,
      authorId: data.authorId ?? null,
      personaId: data.personaId ?? null,
      content: data.content,
      attachments: data.attachments ?? null,
    })
    .returning()
    .get();
  return asAsync(row);
}

/** Convenience: create an agent message in project chat */
export function createAgentProjectMessage(
  projectId: number,
  personaId: string,
  content: string
) {
  return createProjectMessage({
    projectId,
    authorType: "agent",
    personaId,
    content,
  });
}

/** Get recent messages as formatted strings (for dispatch context) */
export function getRecentProjectMessagesFormatted(projectId: number, limit = 20) {
  const rows = db
    .select()
    .from(projectMessages)
    .where(eq(projectMessages.projectId, projectId))
    .orderBy(desc(projectMessages.createdAt))
    .limit(limit)
    .all()
    .reverse();

  const formatted = rows.map((c) => {
    let authorName = "Unknown";
    if (c.authorType === "agent" && c.personaId) {
      const p = db
        .select()
        .from(personas)
        .where(eq(personas.id, c.personaId))
        .get();
      if (p) authorName = `${p.name} (${p.role})`;
    } else if (c.authorType === "human") {
      authorName = "Human";
    } else {
      authorName = "System";
    }
    return `**${authorName}** [${c.authorType}]:\n${c.content}`;
  });

  return asAsync(formatted);
}

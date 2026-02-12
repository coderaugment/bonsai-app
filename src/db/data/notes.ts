import { db, asAsync, runAsync } from "./_driver";
import { projectNotes, extractedItems } from "../schema";
import { eq, and, desc } from "drizzle-orm";

export function getNotesByProject(projectId: number) {
  const rows = db
    .select()
    .from(projectNotes)
    .where(eq(projectNotes.projectId, projectId))
    .orderBy(desc(projectNotes.createdAt))
    .all();
  return asAsync(rows);
}

export function createNote(
  projectId: number,
  type: "text" | "image",
  content: string
) {
  const row = db
    .insert(projectNotes)
    .values({ projectId, type, content })
    .returning()
    .get();
  return asAsync(row);
}

export function deleteNote(noteId: number, projectId: number): Promise<void> {
  return runAsync(() => {
    db.delete(projectNotes)
      .where(
        and(
          eq(projectNotes.id, noteId),
          eq(projectNotes.projectId, projectId)
        )
      )
      .run();
  });
}

export function getExtractionsByProject(projectId: number) {
  const rows = db
    .select()
    .from(extractedItems)
    .where(
      and(
        eq(extractedItems.projectId, projectId),
        eq(extractedItems.status, "pending")
      )
    )
    .orderBy(desc(extractedItems.createdAt))
    .all();
  return asAsync(rows);
}

export function createExtraction(data: {
  projectId: number;
  title: string;
  description?: string | null;
  type: "feature" | "bug" | "chore";
  status: "pending" | "approved" | "rejected";
}) {
  const row = db
    .insert(extractedItems)
    .values({
      projectId: data.projectId,
      title: data.title,
      description: data.description || null,
      type: data.type,
      status: data.status,
    })
    .returning()
    .get();
  return asAsync(row);
}

export function updateExtractionStatus(
  itemId: number,
  status: "approved" | "rejected"
): Promise<void> {
  return runAsync(() => {
    db.update(extractedItems)
      .set({ status })
      .where(eq(extractedItems.id, itemId))
      .run();
  });
}

export function getExtractionById(itemId: number) {
  const row = db
    .select()
    .from(extractedItems)
    .where(eq(extractedItems.id, itemId))
    .get();
  return asAsync(row ?? null);
}

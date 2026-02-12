import { db, asAsync, runAsync } from "./_driver";
import { settings } from "../schema";
import { eq } from "drizzle-orm";

export function getSetting(key: string): Promise<string | null> {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return asAsync(row?.value ?? null);
}

export function setSetting(key: string, value: string): Promise<void> {
  return runAsync(() => {
    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  });
}

export function deleteSetting(key: string): Promise<void> {
  return runAsync(() => {
    db.delete(settings).where(eq(settings.key, key)).run();
  });
}

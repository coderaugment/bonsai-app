import { db, asAsync } from "./_driver";
import { users } from "../schema";
import { eq } from "drizzle-orm";

export function getUser() {
  const row = db.select().from(users).limit(1).get() ?? null;
  return asAsync(row);
}

export function createUser(name: string) {
  const row = db.insert(users).values({ name }).returning().get();
  return asAsync(row);
}

export function updateUser(
  id: number,
  data: { name?: string; avatarUrl?: string | null }
) {
  const row = db
    .update(users)
    .set(data)
    .where(eq(users.id, id))
    .returning()
    .get();
  return asAsync(row);
}

import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUser } from "@/db/queries";

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const user = getUser();
  if (!user) {
    return NextResponse.json({ error: "No user found" }, { status: 404 });
  }

  db.update(users)
    .set({ name: name.trim() })
    .where(eq(users.id, user.id))
    .run();

  return NextResponse.json({ success: true });
}

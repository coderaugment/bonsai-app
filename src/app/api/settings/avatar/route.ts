import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUser } from "@/db/queries";

export async function POST(req: Request) {
  const { avatarUrl } = await req.json();
  if (!avatarUrl) {
    return NextResponse.json({ error: "avatarUrl is required" }, { status: 400 });
  }

  const user = getUser();
  if (!user) {
    return NextResponse.json({ error: "No user found" }, { status: 404 });
  }

  db.update(users)
    .set({ avatarUrl })
    .where(eq(users.id, user.id))
    .run();

  return NextResponse.json({ success: true });
}

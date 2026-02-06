import { NextResponse } from "next/server";
import { getVault } from "@/lib/vault";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getUser } from "@/db/queries";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const { token } = await req.json();
  if (!token?.trim().startsWith("ghp_")) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const vault = await getVault();
  await vault.set("github", token.trim(), "token");

  // Auto-fetch GitHub avatar and save to user record
  try {
    const ghRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    if (ghRes.ok) {
      const ghData = await ghRes.json();
      const user = getUser();
      if (user && ghData.avatar_url) {
        db.update(users)
          .set({ avatarUrl: ghData.avatar_url })
          .where(eq(users.id, user.id))
          .run();
      }
    }
  } catch {
    // Non-critical — avatar will be fetched later
  }

  return NextResponse.json({ success: true });
}

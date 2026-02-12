import { NextResponse } from "next/server";
import { getVault } from "@/lib/vault";
import { getUser, updateUser } from "@/db/data/users";

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
      const user = await getUser();
      if (user && ghData.avatar_url) {
        await updateUser(user.id, { avatarUrl: ghData.avatar_url });
      }
    }
  } catch {
    // Non-critical — avatar will be fetched later
  }

  return NextResponse.json({ success: true });
}

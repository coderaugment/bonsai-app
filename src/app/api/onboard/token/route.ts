import { NextResponse } from "next/server";
import { getVault } from "@/lib/vault";
import { getSetting, setSetting } from "@/db/data/settings";

export async function POST(req: Request) {
  const { token } = await req.json();
  if (!token?.trim().startsWith("ghp_")) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const vault = await getVault();
  await vault.set("github", token.trim(), "token");

  // Auto-fetch GitHub name and save to settings if not already set
  try {
    const ghRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    if (ghRes.ok) {
      const ghData = await ghRes.json();
      const currentName = await getSetting("user_name");
      if (!currentName && ghData.name) {
        await setSetting("user_name", ghData.name);
      }
    }
  } catch {
    // Non-critical — name will be set later if needed
  }

  return NextResponse.json({ success: true });
}

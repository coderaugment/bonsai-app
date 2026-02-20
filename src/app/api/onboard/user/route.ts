import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/db/data/settings";

export async function GET() {
  const name = await getSetting("user_name");
  const avatarUrl = await getSetting("user_avatar_url");

  return NextResponse.json({
    user: {
      name: name || "User",
      avatarUrl: avatarUrl || null,
    },
  });
}

export async function POST(req: Request) {
  const { name, avatarUrl } = await req.json();

  if (name) {
    await setSetting("user_name", name);
  }
  if (avatarUrl) {
    await setSetting("user_avatar_url", avatarUrl);
  }

  return NextResponse.json({ ok: true });
}

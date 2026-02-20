import { NextResponse } from "next/server";
import { setSetting } from "@/db/data/settings";

export async function POST(req: Request) {
  const { avatarUrl } = await req.json();
  if (!avatarUrl) {
    return NextResponse.json({ error: "avatarUrl is required" }, { status: 400 });
  }

  await setSetting("user_avatar_url", avatarUrl);
  return NextResponse.json({ success: true });
}

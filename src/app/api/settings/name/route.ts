import { NextResponse } from "next/server";
import { setSetting } from "@/db/data/settings";

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  await setSetting("user_name", name.trim());
  return NextResponse.json({ success: true });
}

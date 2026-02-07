import { NextRequest, NextResponse } from "next/server";
import { setSetting } from "@/db/queries";

export async function POST(req: NextRequest) {
  const { key, value } = await req.json();

  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }

  setSetting(key, String(value));
  return NextResponse.json({ ok: true });
}

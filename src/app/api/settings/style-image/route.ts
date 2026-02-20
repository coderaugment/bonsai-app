import { NextResponse } from "next/server";
import { getSetting, setSetting, deleteSetting } from "@/db/data/settings";

const KEY = "avatar_style_image";

export async function GET() {
  const image = await getSetting(KEY);
  // Validate it's actually a data URL before returning
  const valid = typeof image === "string" && image.startsWith("data:image/");
  return NextResponse.json({ image: valid ? image : null });
}

export async function POST(req: Request) {
  const { image } = await req.json();
  if (!image || typeof image !== "string") {
    return NextResponse.json({ error: "image required" }, { status: 400 });
  }
  setSetting(KEY, image);
  return NextResponse.json({ success: true });
}

export async function DELETE() {
  deleteSetting(KEY);
  return NextResponse.json({ success: true });
}

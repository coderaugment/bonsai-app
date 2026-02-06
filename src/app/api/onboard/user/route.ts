import { NextResponse } from "next/server";
import { createUser, getUser } from "@/db/queries";

export async function GET() {
  const user = getUser();
  return NextResponse.json({ user });
}

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const user = createUser(name.trim());
  return NextResponse.json({ success: true, user });
}

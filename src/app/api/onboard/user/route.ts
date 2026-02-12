import { NextResponse } from "next/server";
import { createUser, getUser } from "@/db/data/users";

export async function GET() {
  const user = await getUser();
  return NextResponse.json({ user });
}

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const user = await createUser(name.trim());
  return NextResponse.json({ success: true, user });
}

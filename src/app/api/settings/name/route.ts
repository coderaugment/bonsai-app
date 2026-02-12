import { NextResponse } from "next/server";
import { getUser, updateUser } from "@/db/data/users";

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "No user found" }, { status: 404 });
  }

  await updateUser(user.id, { name: name.trim() });
  return NextResponse.json({ success: true });
}

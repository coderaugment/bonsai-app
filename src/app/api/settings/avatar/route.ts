import { NextResponse } from "next/server";
import { getUser, updateUser } from "@/db/data/users";

export async function POST(req: Request) {
  const { avatarUrl } = await req.json();
  if (!avatarUrl) {
    return NextResponse.json({ error: "avatarUrl is required" }, { status: 400 });
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "No user found" }, { status: 404 });
  }

  await updateUser(user.id, { avatarUrl });
  return NextResponse.json({ success: true });
}

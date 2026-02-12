import { NextResponse } from "next/server";
import { getGithubToken } from "@/lib/vault";
import { getUser, updateUser } from "@/db/data/users";

export async function GET() {
  const token = await getGithubToken();

  if (!token) {
    return NextResponse.json(
      { error: "GitHub token not configured" },
      { status: 401 }
    );
  }

  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch GitHub user" },
      { status: res.status }
    );
  }

  const data = await res.json();

  // Sync name + avatar from GitHub to local user record
  const user = await getUser();
  if (user && data.avatar_url) {
    await updateUser(user.id, { avatarUrl: data.avatar_url, name: data.name || user.name });
  }

  return NextResponse.json({
    login: data.login,
    avatarUrl: data.avatar_url,
    name: data.name,
  });
}

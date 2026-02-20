import { NextResponse } from "next/server";
import { getGithubToken } from "@/lib/vault";
import { getSetting, setSetting } from "@/db/data/settings";

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

  // Sync name from GitHub to settings if not already set
  const currentName = await getSetting("user_name");
  if (!currentName && data.name) {
    await setSetting("user_name", data.name);
  }

  return NextResponse.json({
    login: data.login,
    avatarUrl: data.avatar_url,
    name: data.name,
  });
}

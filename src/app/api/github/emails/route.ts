import { NextResponse } from "next/server";
import { getGithubToken } from "@/lib/vault";

export async function GET() {
  const token = await getGithubToken();

  if (!token) {
    return NextResponse.json(
      { error: "GitHub token not configured" },
      { status: 401 }
    );
  }

  const res = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch GitHub emails" },
      { status: res.status }
    );
  }

  const emails = await res.json();
  return NextResponse.json(emails);
}

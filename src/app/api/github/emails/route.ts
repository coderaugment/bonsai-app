import { NextResponse } from "next/server";
// GitHub token stored in settings table

export async function GET() {
  const token = process.env.GITHUB_TOKEN;

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

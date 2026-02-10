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

  // Check token scopes via HEAD request
  const res = await fetch("https://api.github.com/user", {
    method: "HEAD",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  const scopes = res.headers.get("x-oauth-scopes");
  const rateLimit = res.headers.get("x-ratelimit-remaining");

  // Try to get user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  const user = userRes.ok ? await userRes.json() : null;

  // Try to get emails
  const emailRes = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  const emails = emailRes.ok ? await emailRes.json() : { error: emailRes.status };

  return NextResponse.json({
    scopes: scopes?.split(", ") || [],
    rateLimit: parseInt(rateLimit || "0"),
    user: user ? { login: user.login, email: user.email } : null,
    emails,
  });
}

import { NextResponse } from "next/server";
import { getGithubToken } from "@/lib/vault";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const token = await getGithubToken();
  if (!token) {
    return NextResponse.json({ exists: false });
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!userRes.ok) {
    return NextResponse.json({ exists: false });
  }
  const user = await userRes.json();

  const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
  const repoRes = await fetch(
    `https://api.github.com/repos/${user.login}/${slug}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (repoRes.ok) {
    const repo = await repoRes.json();
    return NextResponse.json({
      exists: true,
      name: repo.name,
      description: repo.description,
      private: repo.private,
    });
  }

  return NextResponse.json({ exists: false });
}

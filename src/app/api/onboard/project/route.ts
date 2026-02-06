import { NextResponse } from "next/server";
import { createProject } from "@/db/queries";
import { getGithubToken } from "@/lib/vault";

async function githubFetch(path: string, token: string, options?: RequestInit) {
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}

export async function POST(req: Request) {
  const { name, visibility, description } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
  const token = await getGithubToken();

  if (!token) {
    return NextResponse.json(
      { error: "GitHub token not configured. Please go back and connect GitHub." },
      { status: 401 }
    );
  }

  // 1. Get authenticated user
  const userRes = await githubFetch("/user", token);
  if (!userRes.ok) {
    return NextResponse.json(
      { error: "Failed to authenticate with GitHub. Check your token." },
      { status: 401 }
    );
  }
  const githubUser = await userRes.json();
  const owner = githubUser.login;

  // 2. Check if repo already exists
  const repoCheckRes = await githubFetch(`/repos/${owner}/${slug}`, token);
  let repoName = slug;

  if (repoCheckRes.status === 404) {
    // 3. Create new repo
    const createRes = await githubFetch("/user/repos", token, {
      method: "POST",
      body: JSON.stringify({
        name: slug,
        description: description?.trim() || `${name.trim()} — managed by Bonsai`,
        private: visibility !== "public",
        auto_init: true,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.message || "Failed to create GitHub repository" },
        { status: createRes.status }
      );
    }

    const repo = await createRes.json();
    repoName = repo.name;
  } else if (!repoCheckRes.ok) {
    return NextResponse.json(
      { error: "Failed to check if repository exists on GitHub" },
      { status: repoCheckRes.status }
    );
  }

  // 4. Save project locally (upserts on slug conflict)
  const project = createProject({
    name: name.trim(),
    slug: repoName,
    visibility: visibility || "private",
    description: description?.trim() || undefined,
    githubOwner: owner,
    githubRepo: repoName,
  });

  return NextResponse.json({ success: true, project });
}

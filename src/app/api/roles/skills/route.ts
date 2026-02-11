import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const HOME = process.env.HOME || "~";
const AGENTS_DIR = path.join(HOME, ".bonsai", "agents");

interface SkillInfo {
  name: string;
  description: string;
  content: string;
  scope: "shared" | "role";
  path: string;
}

function parseSkillFile(filePath: string): { name: string; description: string; content: string } {
  const raw = fs.readFileSync(filePath, "utf-8");
  let name = path.basename(path.dirname(filePath));
  let description = "";
  let content = raw;

  // Parse YAML frontmatter
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (fmMatch) {
    const frontmatter = fmMatch[1];
    content = fmMatch[2].trim();
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim();
    if (descMatch) description = descMatch[1].trim();
  }

  return { name, description, content };
}

function listSkills(dirPath: string, scope: "shared" | "role"): SkillInfo[] {
  const skillsDir = path.join(dirPath, ".claude", "skills");
  if (!fs.existsSync(skillsDir)) return [];

  const skills: SkillInfo[] = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;

    const parsed = parseSkillFile(skillMd);
    skills.push({
      ...parsed,
      scope,
      path: skillMd,
    });
  }
  return skills;
}

// GET /api/roles/skills?role=researcher
// Returns shared skills + role-specific skills
export async function GET(req: NextRequest) {
  const roleSlug = req.nextUrl.searchParams.get("role");

  const shared = listSkills(path.join(AGENTS_DIR, "_shared"), "shared");
  const roleSpecific = roleSlug
    ? listSkills(path.join(AGENTS_DIR, roleSlug), "role")
    : [];

  return NextResponse.json({ skills: [...shared, ...roleSpecific] });
}

// POST /api/roles/skills — Create or update a skill file
export async function POST(req: NextRequest) {
  const { role, skillName, description, content, scope } = await req.json();

  if (!skillName?.trim()) {
    return NextResponse.json({ error: "Skill name required" }, { status: 400 });
  }

  const slug = skillName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const baseDir = scope === "shared" ? "_shared" : (role || "_shared");
  const skillDir = path.join(AGENTS_DIR, baseDir, ".claude", "skills", slug);

  fs.mkdirSync(skillDir, { recursive: true });

  const frontmatter = [
    "---",
    `name: ${slug}`,
    `description: ${(description || "").replace(/\n/g, " ")}`,
    `user-invocable: false`,
    "---",
  ].join("\n");

  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `${frontmatter}\n\n${content || ""}`
  );

  return NextResponse.json({ ok: true, path: path.join(skillDir, "SKILL.md") });
}

// DELETE /api/roles/skills — Delete a skill
export async function DELETE(req: NextRequest) {
  const { skillPath } = await req.json();

  if (!skillPath || !skillPath.includes(".bonsai/agents/")) {
    return NextResponse.json({ error: "Invalid skill path" }, { status: 400 });
  }

  const skillDir = path.dirname(skillPath);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true });
  }

  return NextResponse.json({ ok: true });
}

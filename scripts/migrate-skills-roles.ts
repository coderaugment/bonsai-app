/**
 * Migration: Add skills, roles, and role_skills tables
 * Also adds role_id column to personas
 *
 * Run with: npx tsx scripts/migrate-skills-roles.ts
 */

import Database from "better-sqlite3";
import path from "path";

const dbPaths = [
  path.join(process.cwd(), "bonsai.db"),
  path.join(process.cwd(), "bonsai-dev.db"),
];

const createSkillsTable = `
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT CHECK(category IN ('technical', 'communication', 'planning', 'analysis', 'creative')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

const createRolesTable = `
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon TEXT,
  workflow TEXT,
  system_prompt TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

const createRoleSkillsTable = `
CREATE TABLE IF NOT EXISTS role_skills (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, skill_id)
);
`;

// Seed data for default skills
const defaultSkills = [
  // Technical skills
  { name: "Code implementation", description: "Write clean, functional code", category: "technical" },
  { name: "Test writing", description: "Create unit and integration tests", category: "technical" },
  { name: "Debugging", description: "Identify and fix bugs", category: "technical" },
  { name: "Code review", description: "Review code for quality and issues", category: "technical" },
  { name: "Refactoring", description: "Improve code structure without changing behavior", category: "technical" },
  { name: "API design", description: "Design RESTful and GraphQL APIs", category: "technical" },

  // Analysis skills
  { name: "Requirements analysis", description: "Break down user requirements into tasks", category: "analysis" },
  { name: "Codebase exploration", description: "Navigate and understand existing code", category: "analysis" },
  { name: "Edge case identification", description: "Find boundary conditions and corner cases", category: "analysis" },
  { name: "Constraint mapping", description: "Identify technical and business constraints", category: "analysis" },
  { name: "Risk assessment", description: "Evaluate potential risks and mitigations", category: "analysis" },

  // Planning skills
  { name: "Task breakdown", description: "Decompose work into manageable pieces", category: "planning" },
  { name: "Sprint planning", description: "Plan and prioritize sprint work", category: "planning" },
  { name: "Process optimization", description: "Improve team workflows", category: "planning" },
  { name: "Roadmap planning", description: "Plan long-term feature development", category: "planning" },

  // Communication skills
  { name: "Technical documentation", description: "Write clear technical docs", category: "communication" },
  { name: "Stakeholder communication", description: "Keep stakeholders informed", category: "communication" },
  { name: "Status reporting", description: "Provide clear progress updates", category: "communication" },

  // Creative skills
  { name: "UI/UX design", description: "Design user interfaces", category: "creative" },
  { name: "Prototyping", description: "Create interactive prototypes", category: "creative" },
  { name: "Design systems", description: "Build consistent design systems", category: "creative" },
  { name: "User research", description: "Understand user needs", category: "creative" },
  { name: "Accessibility", description: "Ensure accessible interfaces", category: "creative" },
];

// Default roles with their skill mappings
const defaultRoles = [
  {
    slug: "researcher",
    title: "Research Analyst",
    description: "Investigates tickets before implementation. Explores the codebase, identifies constraints, and documents findings.",
    color: "#f59e0b",
    workflow: ["Read and restate the ticket", "Explore codebase for context", "Map affected areas", "Identify edge cases", "Document findings"],
    skillNames: ["Requirements analysis", "Codebase exploration", "Edge case identification", "Constraint mapping", "Technical documentation"],
  },
  {
    slug: "developer",
    title: "Software Developer",
    description: "Implements features and fixes bugs. Writes clean, tested code following project patterns.",
    color: "#6366f1",
    workflow: ["Review implementation plan", "Write implementation", "Add tests", "Self-review changes", "Submit for review"],
    skillNames: ["Code implementation", "Test writing", "Code review", "Debugging", "Refactoring"],
  },
  {
    slug: "designer",
    title: "Product Designer",
    description: "Creates user interfaces and experiences. Focuses on usability, accessibility, and visual design.",
    color: "#ec4899",
    workflow: ["Understand requirements", "Research patterns", "Create wireframes", "Design mockups", "Document specs"],
    skillNames: ["UI/UX design", "Prototyping", "Design systems", "User research", "Accessibility"],
  },
  {
    slug: "manager",
    title: "Project Manager",
    description: "Coordinates work and removes blockers. Keeps the team aligned and stakeholders informed.",
    color: "#10b981",
    workflow: ["Review project status", "Identify blockers", "Coordinate team", "Update stakeholders", "Plan next steps"],
    skillNames: ["Task breakdown", "Sprint planning", "Stakeholder communication", "Status reporting", "Process optimization"],
  },
];

for (const dbPath of dbPaths) {
  console.log(`\nMigrating: ${dbPath}`);

  try {
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");

    // Create tables
    console.log("  Creating skills table...");
    db.exec(createSkillsTable);

    console.log("  Creating roles table...");
    db.exec(createRolesTable);

    console.log("  Creating role_skills table...");
    db.exec(createRoleSkillsTable);

    // Add role_id column to personas if not exists
    const personasInfo = db.prepare("PRAGMA table_info(personas)").all() as { name: string }[];
    const hasRoleId = personasInfo.some((col) => col.name === "role_id");
    if (!hasRoleId) {
      console.log("  Adding role_id column to personas...");
      db.exec("ALTER TABLE personas ADD COLUMN role_id INTEGER REFERENCES roles(id);");
    }

    // Check if we already have data
    const existingSkillCount = db.prepare("SELECT COUNT(*) as count FROM skills").get() as { count: number };

    if (existingSkillCount.count === 0) {
      console.log("  Seeding default skills...");
      const insertSkill = db.prepare(
        "INSERT INTO skills (name, description, category) VALUES (?, ?, ?)"
      );
      for (const skill of defaultSkills) {
        insertSkill.run(skill.name, skill.description, skill.category);
      }

      console.log("  Seeding default roles...");
      const insertRole = db.prepare(
        "INSERT INTO roles (slug, title, description, color, workflow) VALUES (?, ?, ?, ?, ?)"
      );
      const insertRoleSkill = db.prepare(
        "INSERT INTO role_skills (role_id, skill_id) VALUES (?, ?)"
      );
      const getSkillByName = db.prepare("SELECT id FROM skills WHERE name = ?");

      for (const role of defaultRoles) {
        const roleResult = insertRole.run(
          role.slug,
          role.title,
          role.description,
          role.color,
          JSON.stringify(role.workflow)
        );
        const roleId = roleResult.lastInsertRowid;

        for (const skillName of role.skillNames) {
          const skill = getSkillByName.get(skillName) as { id: number } | undefined;
          if (skill) {
            insertRoleSkill.run(roleId, skill.id);
          }
        }
      }
    } else {
      console.log("  Data already exists, skipping seed...");
    }

    db.close();
    console.log("  Done!");
  } catch (err) {
    console.error(`  Error migrating ${dbPath}:`, err);
  }
}

console.log("\nMigration complete!");

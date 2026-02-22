/**
 * Reset the database and seed with test data.
 * Creates a sample project with personas and tickets in various states.
 *
 * Usage: BONSAI_ENV=dev npx tsx src/db/reset-test.ts
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env.BONSAI_ENV || "prod";
const dbFile = env === "dev" ? "bonsai-dev.db" : "bonsai.db";
const dbPath = path.join(__dirname, "../..", dbFile);

console.log(`Resetting ${dbFile} with test data (env: ${env})...`);

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite, { schema });

// Clear existing data (child tables first to satisfy FK constraints)
db.delete(schema.ticketDocuments).run();
db.delete(schema.comments).run();
db.delete(schema.tickets).run();
db.delete(schema.personas).run();
db.delete(schema.roleSkills).run();
db.delete(schema.roles).run();
db.delete(schema.skills).run();
db.delete(schema.projects).run();
db.delete(schema.settings).run();
db.delete(schema.users).run();

// Seed user
const user = db
  .insert(schema.users)
  .values({ name: "Test User" })
  .returning()
  .get();
console.log(`Created user: ${user.name}`);

// Seed project
const project = db
  .insert(schema.projects)
  .values({
    name: "Bonsai",
    slug: "bonsai",
    visibility: "private",
    description: "Bonsai Developer OS",
    githubOwner: "test-user",
    githubRepo: "bonsai",
  })
  .returning()
  .get();
console.log(`Created project: ${project.name} (id: ${project.id})`);

// Seed roles
const roleData = [
  { slug: "lead", title: "Lead", description: "Coordinates work and removes blockers. Keeps the team aligned and stakeholders informed.", color: "#22c55e" },
  { slug: "researcher", title: "Research Analyst", description: "Investigates tickets before implementation. Explores the codebase, identifies constraints, and documents findings.", color: "#8b5cf6" },
  { slug: "developer", title: "Software Developer", description: "Implements features and fixes bugs. Writes clean, tested code following project patterns.", color: "#3b82f6" },
  { slug: "designer", title: "Product Designer", description: "Creates user interfaces and experiences. Focuses on usability, accessibility, and visual design.", color: "#f59e0b" },
  { slug: "critic", title: "Critic", description: "Challenges assumptions and stress-tests ideas. The constructive contrarian who asks the hard questions.", color: "#ef4444" },
  { slug: "hacker", title: "Hacker", description: "Security-focused engineer who finds vulnerabilities and hardens the codebase.", color: "#06b6d4" },
];
const insertedRoles = db.insert(schema.roles).values(roleData).returning().all();
const roleMap = new Map(insertedRoles.map((r) => [r.slug, r.id]));
console.log(`Created ${insertedRoles.length} roles`);

// Seed personas
const personaData = [
  {
    id: "p1", name: "Kira", slug: "kira", color: "#3b82f6", projectId: project.id,
    role: "developer" as const, roleId: roleMap.get("developer"),
    personality: "Methodical and precise. Prefers small, well-tested PRs over large sweeping changes. Gets excited about type safety and elegant abstractions.",
    skills: JSON.stringify(["React", "TypeScript", "Node.js", "Testing", "CI/CD"]),
    processes: JSON.stringify(["TDD", "Code review", "Trunk-based dev"]),
    goals: JSON.stringify(["Clean code", "Test coverage", "Ship fast"]),
    permissions: JSON.stringify({ tools: ["git", "npm", "docker", "bash"], folders: ["src/", "tests/"] }),
  },
  {
    id: "p2", name: "Renzo", slug: "renzo", color: "#22c55e", projectId: project.id,
    role: "lead" as const, roleId: roleMap.get("lead"),
    personality: "Calm under pressure with a talent for breaking big goals into achievable sprints. The team's favorite meeting facilitator.",
    skills: JSON.stringify(["Planning", "Risk assessment", "Agile", "Sprint planning"]),
    processes: JSON.stringify(["Stand-ups", "Retrospectives", "Status reports"]),
    goals: JSON.stringify(["On-time delivery", "Team velocity", "Clear priorities"]),
    permissions: JSON.stringify({ tools: ["tickets", "calendar", "notifications"], folders: ["docs/", "plans/"] }),
  },
  {
    id: "p3", name: "Mika", slug: "mika", color: "#f59e0b", projectId: project.id,
    role: "designer" as const, roleId: roleMap.get("designer"),
    personality: "Visually driven with strong opinions about whitespace. Believes every pixel matters but ships imperfect work early to gather feedback fast.",
    skills: JSON.stringify(["Figma", "UI design", "UX research", "Design systems", "Accessibility"]),
    processes: JSON.stringify(["User interviews", "Design critique", "Iterative prototyping"]),
    goals: JSON.stringify(["User satisfaction", "Consistent design", "Accessible interfaces"]),
    permissions: JSON.stringify({ tools: ["figma", "image-gen", "file-read"], folders: ["assets/", "components/"] }),
  },
] as const;

db.insert(schema.personas).values([...personaData]).run();
console.log(`Created ${personaData.length} personas`);

sqlite.close();
console.log(`Test data seed complete for ${dbFile}.`);

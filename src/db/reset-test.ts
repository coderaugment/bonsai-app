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
db.delete(schema.extractedItems).run();
db.delete(schema.projectNotes).run();
db.delete(schema.ticketAttachments).run();
db.delete(schema.ticketDocuments).run();
db.delete(schema.comments).run();
db.delete(schema.tickets).run();
db.delete(schema.personas).run();
db.delete(schema.roleSkills).run();
db.delete(schema.roles).run();
db.delete(schema.skills).run();
db.delete(schema.projects).run();
db.delete(schema.settings).run();

// Set user name in settings
db.insert(schema.settings)
  .values({ key: "user_name", value: "Ryan" })
  .onConflictDoUpdate({ target: schema.settings.key, set: { value: "Ryan" } })
  .run();
console.log("Set user name to Ryan");

// No project — onboarding flow: github → project create → team → ticket

// Seed roles (available for team building)
const roleData = [
  { slug: "lead", title: "Lead", description: "Coordinates work and removes blockers. Keeps the team aligned and stakeholders informed.", color: "#22c55e" },
  { slug: "researcher", title: "Researcher", description: "Investigates tickets before implementation. Explores the codebase, identifies constraints, and documents findings.", color: "#8b5cf6" },
  { slug: "developer", title: "Developer", description: "Implements features and fixes bugs. Writes clean, tested code following project patterns.", color: "#3b82f6" },
  { slug: "designer", title: "Designer", description: "Creates user interfaces and experiences. Focuses on usability, accessibility, and visual design.", color: "#f59e0b" },
  { slug: "critic", title: "Critic", description: "Challenges assumptions and stress-tests ideas. The constructive contrarian who asks the hard questions.", color: "#ef4444" },
  { slug: "hacker", title: "Hacker", description: "Security-focused engineer who finds vulnerabilities and hardens the codebase.", color: "#06b6d4" },
];
const insertedRoles = db.insert(schema.roles).values(roleData).returning().all();
console.log(`Created ${insertedRoles.length} roles (no personas yet — build your team after project creation)`);

sqlite.close();
console.log(`Test data seed complete for ${dbFile}.`);

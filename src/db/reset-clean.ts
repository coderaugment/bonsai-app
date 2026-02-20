/**
 * Reset the database to a clean state with default roles seeded.
 * No workers, no projects, no tickets — just the 4 base role archetypes.
 *
 * Usage: BONSAI_ENV=dev npx tsx src/db/reset-clean.ts
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env.BONSAI_ENV || "prod";
const dbFile = env === "dev" ? "bonsai-dev.db" : "bonsai.db";
const dbPath = path.join(__dirname, "../..", dbFile);

console.log(`Resetting ${dbFile} (env: ${env})...`);

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = OFF");

// Drop all data in dependency order
const tables = [
  "ticket_documents",
  "comments",
  "tickets",
  "personas",
  "projects",
  "role_skills",
  "roles",
  "skills",
  "settings",
  "users",
];
for (const table of tables) {
  try {
    sqlite.prepare(`DELETE FROM ${table}`).run();
  } catch {
    // Table might not exist yet
  }
}

// Reset autoincrement counters
try {
  sqlite.prepare("DELETE FROM sqlite_sequence").run();
} catch {
  // No sequence table yet
}

// Seed default roles
const insertRole = sqlite.prepare(
  `INSERT INTO roles (slug, title, description, color) VALUES (?, ?, ?, ?)`
);

insertRole.run("researcher", "Researcher", "Investigates problems, analyzes codebases, and produces research documents.", "#8b5cf6");
insertRole.run("developer", "Developer", "Builds features, fixes bugs, writes tests, and ships code.", "#3b82f6");
insertRole.run("designer", "Designer", "Creates UI/UX designs, design systems, and visual assets.", "#f59e0b");
insertRole.run("critic", "Critic", "Challenges assumptions and stress-tests ideas. The constructive contrarian.", "#ef4444");
insertRole.run("hacker", "Hacker", "Security-focused engineer who finds vulnerabilities and hardens the codebase.", "#06b6d4");

console.log("Seeded 5 default roles: researcher, developer, designer, critic, hacker");

sqlite.pragma("foreign_keys = ON");
sqlite.close();

console.log(`Clean reset complete. ${dbFile} has roles only — ready for onboarding.`);

/**
 * Migration: Add build_command and run_command columns to projects table
 *
 * Run with: npx tsx scripts/migrate-project-commands.ts
 */

import Database from "better-sqlite3";
import path from "path";

const dbPaths = [
  path.join(process.cwd(), "bonsai.db"),
  path.join(process.cwd(), "bonsai-dev.db"),
];

for (const dbPath of dbPaths) {
  console.log(`\nMigrating: ${dbPath}`);

  try {
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");

    const cols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];

    if (!cols.some((c) => c.name === "build_command")) {
      console.log("  Adding build_command column...");
      db.exec("ALTER TABLE projects ADD COLUMN build_command TEXT;");
    } else {
      console.log("  build_command already exists, skipping.");
    }

    if (!cols.some((c) => c.name === "run_command")) {
      console.log("  Adding run_command column...");
      db.exec("ALTER TABLE projects ADD COLUMN run_command TEXT;");
    } else {
      console.log("  run_command already exists, skipping.");
    }

    db.close();
    console.log("  Done!");
  } catch (err) {
    console.error(`  Error migrating ${dbPath}:`, err);
  }
}

console.log("\nMigration complete!");

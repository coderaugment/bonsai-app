/**
 * Database Migration Runner
 *
 * Applies pending migrations to the database.
 * Uses BONSAI_ENV to determine which database to migrate.
 *
 * Usage:
 *   npm run db:migrate        # Migrate production database
 *   npm run db:migrate:dev    # Migrate development database
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine which database to use based on environment
const env = process.env.BONSAI_ENV || "prod";
const dbFile = env === "dev" ? "bonsai-dev.db" : "bonsai.db";
const dbPath = path.join(__dirname, `../../${dbFile}`);

console.log(`\n🔄 Running migrations for ${env.toUpperCase()} database...`);
console.log(`📁 Database: ${dbPath}\n`);

// Create database connection
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

try {
  // Run migrations from ./drizzle directory
  migrate(db, { migrationsFolder: path.join(__dirname, "../../drizzle") });

  console.log("✅ Migrations applied successfully!\n");
} catch (error) {
  console.error("❌ Migration failed:", error);
  process.exit(1);
} finally {
  sqlite.close();
}

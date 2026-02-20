import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env.BONSAI_ENV || "prod";
const dbFile = env === "dev" ? "bonsai-dev.db" : "bonsai.db";
const dbPath = path.join(__dirname, `../../${dbFile}`);
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite, { schema });

console.log(`\n🌱 Seeding ${env.toUpperCase()} database...`);
console.log(`📁 Database: ${dbPath}\n`);

// For dev: Only seed essential settings, no data
if (env === "dev") {
  console.log("DEV mode: Seeding settings only (no projects, personas, or tickets)\n");

  // Optional: Set user name if not already set
  const existingUserName = db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(schema.eq(schema.settings.key, "user_name"))
    .get();

  if (!existingUserName) {
    db.insert(schema.settings)
      .values({ key: "user_name", value: "Developer" })
      .run();
    console.log("✓ Set default user_name to 'Developer'");
  }

  console.log("\n✅ Dev seed complete (settings only)\n");
} else {
  // For prod: Can optionally add production seed data here if needed
  console.log("PROD mode: No seed data configured\n");
  console.log("✅ Prod seed complete\n");
}

sqlite.close();

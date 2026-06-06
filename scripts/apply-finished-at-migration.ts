import dotenv from "dotenv";
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const sql = readFileSync("prisma/migrations/add_finished_at/migration.sql", "utf-8");

// Strip comment lines, split on ";", drop blanks
const statements = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

async function run() {
  for (const stmt of statements) {
    try {
      await client.execute(stmt);
    } catch (e) {
      // ADD COLUMN is not idempotent — ignore "duplicate column" so re-runs are safe.
      const msg = (e as Error).message ?? "";
      if (/duplicate column/i.test(msg)) {
        console.log("Column already exists, skipping:", stmt);
        continue;
      }
      throw e;
    }
  }
  console.log("finishedAt migration applied to Turso.");
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });

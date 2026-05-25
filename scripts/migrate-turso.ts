import dotenv from "dotenv";
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const sql = readFileSync("prisma/migrations/20260504155804_init/migration.sql", "utf-8");

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
    await client.execute(stmt);
  }
  console.log("Migration applied to Turso.");
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });

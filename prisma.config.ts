import "dotenv/config";
import path from "path";
import { defineConfig } from "prisma/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "./prisma/dev.db";
const resolvedPath = path.resolve(dbPath);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: `file:${resolvedPath}`,
    // @ts-ignore — adapter field added in Prisma 7
    adapter: new PrismaBetterSqlite3({ url: resolvedPath }),
  },
});

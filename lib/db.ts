import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

type GlobalWithPrisma = typeof globalThis & { prisma?: PrismaClient };

function getClient(): PrismaClient {
  const g = globalThis as GlobalWithPrisma;
  if (g.prisma) return g.prisma;
  const rawUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!rawUrl) throw new Error("TURSO_DATABASE_URL is not set");
  // Force HTTPS — libsql:// uses WebSockets which Vercel serverless doesn't support
  const url = rawUrl.replace(/^libsql:\/\//, "https://");
  const client = new PrismaClient({ adapter: new PrismaLibSql({ url, authToken }) });
  if (process.env.NODE_ENV !== "production") g.prisma = client;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get: (_, prop) => Reflect.get(getClient(), prop),
});

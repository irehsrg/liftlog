export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { prisma } = await import("@/lib/db");
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    const e = err as Error & { cause?: unknown };
    const cause = e.cause as (Error & { cause?: unknown }) | undefined;
    return NextResponse.json(
      {
        error: String(e),
        message: e.message,
        cause: String(cause),
        causeMessage: cause?.message,
        causeCause: String(cause?.cause),
        url: process.env.TURSO_DATABASE_URL?.replace(/^libsql:\/\//, "https://"),
        hasAuth: !!process.env.TURSO_AUTH_TOKEN,
      },
      { status: 500 }
    );
  }
}

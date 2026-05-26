import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/pin") || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const pin = request.cookies.get("liftlog_pin")?.value;
  if (pin === process.env.LIFTLOG_PIN) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/pin";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

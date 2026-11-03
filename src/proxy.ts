import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Optimistic gate only: bounces requests without a valid signed session cookie to
// /login. Real authorization (active user, role, permissions) happens in the
// data-access layer on every page, server action and route handler.

const PUBLIC_PATHS = ["/login", "/api/cron"];
const SESSION_COOKIE = "eams_session";

async function hasValidSession(token: string | undefined) {
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!(await hasValidSession(request.cookies.get(SESSION_COOKIE)?.value))) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    const response = NextResponse.redirect(url);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and image optimisation.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  LEGACY_SESSION_COOKIE,
  REFRESH_COOKIE,
  csrfCookieBase,
} from "@/lib/auth-cookies";
import { CSRF_HEADER, csrfMatches, isAllowedMutatingOrigin } from "@/lib/csrf";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const CSRF_EXEMPT = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/refresh",
  "/api/auth/google",
  "/api/gmail/callback",
];

function hasSessionCookie(req: NextRequest) {
  return Boolean(
    req.cookies.get(ACCESS_COOKIE)?.value ||
      req.cookies.get(REFRESH_COOKIE)?.value ||
      req.cookies.get(LEGACY_SESSION_COOKIE)?.value,
  );
}

function withCsrf(req: NextRequest, res: NextResponse) {
  if (!req.cookies.get(CSRF_COOKIE)?.value) {
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    res.cookies.set(CSRF_COOKIE, token, { ...csrfCookieBase(), maxAge: 30 * 24 * 60 * 60 });
  }
  return res;
}

function forbidden() {
  return NextResponse.json({ error: "Request blocked." }, { status: 403 });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/notebooks/")) {
    if (!hasSessionCookie(req)) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "?auth=1";
      return NextResponse.redirect(url);
    }
    return withCsrf(req, NextResponse.next());
  }

  if (!pathname.startsWith("/api/")) return withCsrf(req, NextResponse.next());

  if (MUTATING.has(req.method) && !CSRF_EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!isAllowedMutatingOrigin(req)) return forbidden();
    const csrfHeader = req.headers.get(CSRF_HEADER) || "";
    const csrfCookie = req.cookies.get(CSRF_COOKIE)?.value || "";
    if (csrfHeader && !csrfMatches(csrfCookie, csrfHeader)) return forbidden();
  }

  return withCsrf(req, NextResponse.next());
}

export const config = {
  matcher: ["/notebooks/:path*", "/api/:path*"],
};

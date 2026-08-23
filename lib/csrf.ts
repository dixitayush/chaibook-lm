/** Origin / CSRF checks. Edge-safe. */

function stripSlash(value: string) {
  return value.replace(/\/$/, "");
}

export function requestOrigin(req: Request) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
    .split(",")[0]
    .trim();
  if (!host) return "";
  const proto =
    (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim() ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}

export function configuredOrigins() {
  const out = new Set<string>();
  const app = stripSlash((process.env.APP_URL || "").trim());
  if (app) out.add(app);
  return out;
}

function originAllowed(origin: string, expected: string) {
  const o = stripSlash(origin);
  if (!o) return false;
  if (expected && o === stripSlash(expected)) return true;
  return configuredOrigins().has(o);
}

export function isAllowedMutatingOrigin(req: Request) {
  const expected = requestOrigin(req);
  const origin = (req.headers.get("origin") || "").trim();
  if (origin) return originAllowed(origin, expected);
  const referer = (req.headers.get("referer") || "").trim();
  if (referer) {
    try {
      const url = new URL(referer);
      return originAllowed(`${url.protocol}//${url.host}`, expected);
    } catch {
      return false;
    }
  }
  return process.env.NODE_ENV !== "production";
}

export const CSRF_HEADER = "x-csrf-token";

export function csrfMatches(cookie: string, header: string) {
  if (!cookie || !header || cookie.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < cookie.length; i++) diff |= cookie.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

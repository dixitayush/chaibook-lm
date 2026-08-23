/** Cookie names + flags. Edge-safe (no Node fs / db). */

export const ACCESS_COOKIE = "cb_at";
export const REFRESH_COOKIE = "cb_rt";
export const CSRF_COOKIE = "cb_csrf";
export const LEGACY_SESSION_COOKIE = "chaibook_session";
export const OAUTH_COOKIE = "chaibook_oauth";

export const ACCESS_MAX_AGE = 15 * 60;
export const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;
export const ACCESS_MS = ACCESS_MAX_AGE * 1000;
export const REFRESH_MS = REFRESH_MAX_AGE * 1000;
export const ABSOLUTE_SESSION_MS = 90 * 24 * 60 * 60 * 1000;

export function cookiesAreSecure() {
  const app = (process.env.APP_URL || "").trim();
  if (app.startsWith("https://")) return true;
  return process.env.NODE_ENV === "production";
}

export function authCookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: cookiesAreSecure(),
  };
}

export function csrfCookieBase() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    path: "/",
    secure: cookiesAreSecure(),
  };
}

export type CookieStore = {
  set: (
    name: string,
    value: string,
    options: {
      httpOnly?: boolean;
      sameSite?: "lax" | "strict" | "none";
      path?: string;
      secure?: boolean;
      maxAge?: number;
    },
  ) => void;
};

export function applyAuthCookies(
  store: CookieStore,
  tokens: { access: string; refresh: string; csrf: string },
) {
  store.set(ACCESS_COOKIE, tokens.access, { ...authCookieBase(), maxAge: ACCESS_MAX_AGE });
  store.set(REFRESH_COOKIE, tokens.refresh, { ...authCookieBase(), maxAge: REFRESH_MAX_AGE });
  store.set(CSRF_COOKIE, tokens.csrf, { ...csrfCookieBase(), maxAge: REFRESH_MAX_AGE });
  store.set(LEGACY_SESSION_COOKIE, "", { ...authCookieBase(), maxAge: 0 });
}

export function clearAuthCookies(store: CookieStore) {
  store.set(ACCESS_COOKIE, "", { ...authCookieBase(), maxAge: 0 });
  store.set(REFRESH_COOKIE, "", { ...authCookieBase(), maxAge: 0 });
  store.set(CSRF_COOKIE, "", { ...csrfCookieBase(), maxAge: 0 });
  store.set(LEGACY_SESSION_COOKIE, "", { ...authCookieBase(), maxAge: 0 });
}


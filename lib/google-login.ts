import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession, upsertGoogleUser } from "@/lib/auth";
import { OAUTH_COOKIE, authCookieBase } from "@/lib/auth-cookies";
import { hydrateEnv, publicOrigin } from "@/lib/env";
import { redirectUri } from "@/lib/gmail";

function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

function homeUrl() {
  return publicOrigin();
}

export async function finishGoogleLogin(code: string | null, err: string | null, csrf: string, req?: Request) {
  const home = homeUrl();
  const fail = NextResponse.redirect(`${home}/?auth=1&error=google`);
  const store = await cookies();
  const expected = store.get(OAUTH_COOKIE)?.value;
  store.set(OAUTH_COOKIE, "", { ...authCookieBase(), maxAge: 0 });
  if (err || !code || !expected || !sameSecret(csrf, expected)) return fail;

  hydrateEnv();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !token.access_token) return fail;

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const me = (await profileRes.json()) as { id?: string; email?: string; name?: string };
  if (!me.email || !me.id) return fail;

  const user = await upsertGoogleUser({ googleId: me.id, email: me.email, name: me.name || "" });
  await createSession(user.id, req);
  return NextResponse.redirect(`${home}/?signed=1`);
}

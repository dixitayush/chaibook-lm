import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { OAUTH_COOKIE, authCookieBase } from "@/lib/auth-cookies";
import { encodeLoginState, googleOAuthConfigured, redirectUri } from "@/lib/gmail";
import { hydrateEnv, publicOrigin } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!googleOAuthConfigured()) {
    return NextResponse.json(
      { error: "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to sign in with Google." },
      { status: 400 },
    );
  }
  hydrateEnv();
  const origin = publicOrigin(req);
  const csrf = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(OAUTH_COOKIE, csrf, { ...authCookieBase(), maxAge: 600 });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: encodeLoginState(origin, csrf),
    prompt: "select_account",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

import { NextResponse } from "next/server";
import { decodeLoginState } from "@/lib/gmail";
import { finishGoogleLogin } from "@/lib/google-login";
import { ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  const login = decodeLoginState(url.searchParams.get("state") || "");
  if (!login) {
    const home = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
    return NextResponse.redirect(`${home}/?auth=1&error=google`);
  }
  return finishGoogleLogin(url.searchParams.get("code"), url.searchParams.get("error"), login.csrf);
}

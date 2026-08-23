import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";
import { sanitizePublicOrigin } from "@/lib/env";
import { decodeGmailState, decodeLoginState, exchangeGmailCode } from "@/lib/gmail";
import { finishGoogleLogin } from "@/lib/google-login";

export const runtime = "nodejs";

export async function GET(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  const rawState = url.searchParams.get("state") || "";
  const login = decodeLoginState(rawState);
  if (login) return finishGoogleLogin(code, err, login.csrf);

  const { notebookId, origin: rawOrigin, kind } = decodeGmailState(rawState);
  const origin = sanitizePublicOrigin(rawOrigin, req);
  const dest = `${origin.replace(/\/$/, "")}/notebooks/${notebookId}`;
  const suffix = kind ? `&kind=${encodeURIComponent(kind)}` : "";
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(`${origin.replace(/\/$/, "")}/?auth=1`);
  if (err || !code || !notebookId) {
    return NextResponse.redirect(`${dest}?gmail=error${suffix}`);
  }
  try {
    await exchangeGmailCode(code, origin, user.id);
    return NextResponse.redirect(`${dest}?gmail=connected${suffix}`);
  } catch {
    return NextResponse.redirect(`${dest}?gmail=error${suffix}`);
  }
}

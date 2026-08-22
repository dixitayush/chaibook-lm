import { NextResponse } from "next/server";
import { requireNotebook } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";
import { gmailAuthUrl, gmailOAuthConfigured } from "@/lib/gmail";

export const runtime = "nodejs";

export async function GET(req: Request) {
  await ensureSchema();
  if (!gmailOAuthConfigured()) {
    return NextResponse.json(
      { error: "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to connect Google." },
      { status: 400 },
    );
  }
  const url = new URL(req.url);
  const notebookId = url.searchParams.get("notebookId") || "";
  const kind = url.searchParams.get("kind") || "";
  if (!notebookId) return NextResponse.json({ error: "notebookId is required" }, { status: 400 });
  const gate = await requireNotebook(notebookId);
  if (gate.response) return gate.response;
  return NextResponse.redirect(gmailAuthUrl(notebookId, url.origin, kind));
}

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { googleOAuthConfigured } from "@/lib/gmail";
import { ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const google = googleOAuthConfigured();
  try {
    await ensureSchema();
    const user = await getSessionUser();
    return NextResponse.json({ user, google });
  } catch {
    return NextResponse.json({ user: null, google });
  }
}

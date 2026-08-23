import { NextResponse } from "next/server";
import { refreshSession } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  await ensureSchema();
  const user = await refreshSession();
  if (!user) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }
  return NextResponse.json({ user });
}

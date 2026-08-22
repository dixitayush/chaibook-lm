import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  await ensureSchema();
  await destroySession();
  return NextResponse.json({ ok: true });
}

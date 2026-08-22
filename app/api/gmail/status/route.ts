import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";
import { gmailStatus } from "@/lib/gmail";

export const runtime = "nodejs";

export async function GET() {
  await ensureSchema();
  const gate = await requireUser();
  if (gate.response) return gate.response;
  return NextResponse.json(await gmailStatus());
}

import { NextResponse } from "next/server";
import {
  createPasswordUser,
  createSession,
  findUserByEmail,
  passwordIssue,
  toPublicUser,
  validEmail,
} from "@/lib/auth";
import { ensureSchema } from "@/lib/db";
import { clientIp, limitOrResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = await limitOrResponse(`register:${await clientIp(req)}`, 8, 60);
  if (limited) return limited;
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string; name?: string };
  const email = (body.email || "").trim();
  const password = body.password || "";
  const name = (body.name || "").trim();
  if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  const passwordError = passwordIssue(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.googleId && !existing.passwordHash) {
      return NextResponse.json({ error: "This email already uses Google. Continue with Google." }, { status: 409 });
    }
    return NextResponse.json({ error: "An account with that email already exists. Sign in instead." }, { status: 409 });
  }
  const row = await createPasswordUser({ email, password, name });
  await createSession(row.id, req);
  return NextResponse.json({ user: toPublicUser(row) });
}

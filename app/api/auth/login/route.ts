import { NextResponse } from "next/server";
import { createSession, findUserByEmail, toPublicUser, validEmail, verifyPassword } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";
import { clientIp, limitOrResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = await limitOrResponse(`login:${await clientIp(req)}`, 10, 60);
  if (limited) return limited;
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = (body.email || "").trim();
  const password = body.password || "";
  if (!validEmail(email) || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const row = await findUserByEmail(email);
  if (!row?.passwordHash) {
    if (row?.googleId) {
      return NextResponse.json({ error: "This email uses Google. Continue with Google." }, { status: 400 });
    }
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  await createSession(row.id);
  return NextResponse.json({ user: toPublicUser(row) });
}

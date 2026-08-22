import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { findUserByEmail, normalizeEmail, requireNotebook, requireNotebookOwner, validEmail } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { notebookShares, users } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { appOrigin, mailConfigured, sendMail } from "@/lib/mail";
import { shareInviteHtml } from "@/lib/chat-export";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response || !gate.user || !gate.notebook) return gate.response;
  const rows = await db.select().from(notebookShares).where(eq(notebookShares.notebookId, id));
  const visible = gate.role === "owner" ? rows : rows.filter((r) => r.email === gate.user.email);
  const emails = visible.map((r) => r.email);
  const accounts = emails.length
    ? await db.select({ email: users.email, name: users.name }).from(users).where(inArray(users.email, emails))
    : [];
  const byEmail = new Map(accounts.map((u) => [u.email, u]));
  const [owner] = gate.notebook.userId
    ? await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, gate.notebook.userId))
    : [];
  return NextResponse.json({
    role: gate.role,
    mailConfigured: mailConfigured(),
    owner: {
      name: owner?.name || owner?.email?.split("@")[0] || "Owner",
      email: owner?.email || "",
      you: owner?.email === gate.user.email,
    },
    shares: visible.map((r) => ({
      id: r.id,
      email: r.email,
      createdAt: r.createdAt,
      hasAccount: byEmail.has(r.email),
      name: byEmail.get(r.email)?.name || r.email.split("@")[0],
      you: r.email === gate.user.email,
    })),
  });
}

export async function POST(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebookOwner(id);
  if (gate.response || !gate.notebook || !gate.user) return gate.response;
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(body.email || "");
  if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (email === gate.user.email) {
    return NextResponse.json({ error: "You already own this notebook." }, { status: 400 });
  }
  const [existing] = await db
    .select()
    .from(notebookShares)
    .where(and(eq(notebookShares.notebookId, id), eq(notebookShares.email, email)));
  if (existing) {
    return NextResponse.json({ error: "That address already has access." }, { status: 409 });
  }
  const row = {
    id: createId("shr"),
    notebookId: id,
    email,
    role: "collaborator",
    invitedBy: gate.user.id,
    createdAt: Date.now(),
  };
  await db.insert(notebookShares).values(row);
  const url = `${appOrigin()}/notebooks/${id}`;
  const invitee = await findUserByEmail(email);
  const mail = await sendMail({
    to: email,
    subject: `${gate.user.name} shared “${gate.notebook.title}” with you`,
    text: `${gate.user.name} shared the ChaiBook notebook “${gate.notebook.title}” with you.\nSign in with ${email} and open:\n${url}\n`,
    html: shareInviteHtml({
      notebookTitle: gate.notebook.title,
      ownerName: gate.user.name,
      notebookUrl: url,
    }),
  });
  return NextResponse.json({
    share: {
      id: row.id,
      email: row.email,
      createdAt: row.createdAt,
      hasAccount: Boolean(invitee),
      name: invitee?.name || email.split("@")[0],
    },
    emailed: mail.sent,
    mailError: mail.sent ? undefined : mail.error,
  });
}

import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireNotebook, validEmail } from "@/lib/auth";
import { chatHtml, chatMarkdown, filenameForChat } from "@/lib/chat-export";
import { db, ensureSchema } from "@/lib/db";
import { mapMessage } from "@/lib/db/map";
import { messages } from "@/lib/db/schema";
import { mailConfigured, sendMail } from "@/lib/mail";
import type { ChatMessage } from "@/lib/types";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";

async function loadChat(notebookId: string) {
  const rows = await db.select().from(messages).where(eq(messages.notebookId, notebookId)).orderBy(asc(messages.createdAt));
  return rows.map(mapMessage) as ChatMessage[];
}

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response || !gate.notebook) return gate.response;
  const chat = await loadChat(id);
  const base = filenameForChat(gate.notebook);
  return NextResponse.json({
    filename: base,
    markdown: chatMarkdown(gate.notebook, chat),
    html: chatHtml(gate.notebook, chat),
    messageCount: chat.filter((m) => m.content.trim()).length,
    mailConfigured: mailConfigured(),
  });
}

export async function POST(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response || !gate.notebook || !gate.user) return gate.response;
  const body = (await req.json().catch(() => ({}))) as { to?: string; note?: string };
  const to = (body.to || "").trim().toLowerCase();
  if (!validEmail(to)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  const chat = await loadChat(id);
  if (!chat.some((m) => m.content.trim())) {
    return NextResponse.json({ error: "There is nothing in this chat to send." }, { status: 400 });
  }
  const note = (body.note || "").slice(0, 800);
  const html = chatHtml(gate.notebook, chat, note);
  const text = chatMarkdown(gate.notebook, chat);
  const mail = await sendMail({
    to,
    subject: `Chat from “${gate.notebook.title}” — ChaiBook LM`,
    html,
    text: note ? `${note}\n\n${text}` : text,
  });
  if (!mail.sent) return NextResponse.json({ error: mail.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireNotebook, requireNotebookOwner } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { mapMessage } from "@/lib/db/map";
import { messages, users } from "@/lib/db/schema";
import { forgetChat } from "@/lib/memory/forget";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const rows = await db
    .select({ message: messages, authorName: users.name, authorEmail: users.email })
    .from(messages)
    .leftJoin(users, eq(messages.userId, users.id))
    .where(eq(messages.notebookId, id));
  rows.sort((a, b) => a.message.createdAt - b.message.createdAt);
  return NextResponse.json({
    messages: rows.map((r) =>
      mapMessage(r.message, {
        authorName:
          r.authorName ||
          r.message.authorName ||
          r.authorEmail?.split("@")[0] ||
          (r.message.role === "assistant" ? "ChaiBook" : "Someone"),
      }),
    ),
  });
}

export async function DELETE(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebookOwner(id);
  if (gate.response) return gate.response;
  await forgetChat(id);
  return NextResponse.json({ ok: true });
}

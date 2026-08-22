import { requireNotebook } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { mapSource } from "@/lib/db/map";
import { notebooks, sources } from "@/lib/db/schema";
import { importGmailMessages } from "@/lib/gmail";
import { enqueueSource } from "@/lib/ingest/create";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;

  const body = (await req.json().catch(() => ({}))) as { query?: string; max?: number };
  let mails;
  try {
    mails = await importGmailMessages(body.query || "", body.max ?? 12);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gmail import failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const existing = await db.select().from(sources).where(eq(sources.notebookId, id));
  const seen = new Set(
    existing
      .map((s) => {
        const meta = s.metadata && typeof s.metadata === "object" ? (s.metadata as Record<string, unknown>) : {};
        return typeof meta.gmailId === "string" ? meta.gmailId : "";
      })
      .filter(Boolean),
  );

  const created = [];
  for (const mail of mails) {
    if (seen.has(mail.gmailId)) continue;
    created.push(
      await enqueueSource({
        notebookId: id,
        type: "email",
        title: mail.subject || "Gmail message",
        content: mail.text,
        metadata: {
          from: mail.from,
          to: mail.to,
          subject: mail.subject,
          date: mail.date,
          gmailId: mail.gmailId,
        },
        userId: gate.user?.id,
        authorName: gate.user?.name,
      }),
    );
  }

  if (!created.length) {
    return NextResponse.json({ error: "Those messages are already in this notebook." }, { status: 409 });
  }

  await db.update(notebooks).set({ updatedAt: Date.now() }).where(eq(notebooks.id, id));
  return NextResponse.json({ sources: created.map(mapSource), imported: created.length });
}

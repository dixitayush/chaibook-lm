import { eq } from "drizzle-orm";
import { after } from "next/server";
import { NextResponse } from "next/server";
import { requireSource } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { mapSource } from "@/lib/db/map";
import { sources } from "@/lib/db/schema";
import { indexSource } from "@/lib/ingest/pipeline";
import { forgetSource, sweepEmptyNotebook } from "@/lib/memory/forget";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireSource(id);
  if (gate.response) return gate.response;
  if (!gate.source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
  return NextResponse.json({ source: mapSource(gate.source) });
}

export async function DELETE(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireSource(id);
  if (gate.response) return gate.response;
  const notebookId = gate.source.notebookId;
  await forgetSource(id);
  await db.delete(sources).where(eq(sources.id, id));
  await sweepEmptyNotebook(notebookId);
  return NextResponse.json({ ok: true });
}

export async function POST(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireSource(id);
  if (gate.response) return gate.response;
  await db
    .update(sources)
    .set({ status: "uploading", error: null, updatedAt: Date.now() })
    .where(eq(sources.id, id));
  after(async () => {
    await indexSource(id);
  });
  const [updated] = await db.select().from(sources).where(eq(sources.id, id));
  return NextResponse.json({ source: mapSource(updated) });
}

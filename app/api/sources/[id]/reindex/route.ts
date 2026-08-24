import { eq } from "drizzle-orm";
import { after } from "next/server";
import { NextResponse } from "next/server";
import { requireSource } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { mapSource } from "@/lib/db/map";
import { sources } from "@/lib/db/schema";
import { indexSource } from "@/lib/ingest/pipeline";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 120;

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

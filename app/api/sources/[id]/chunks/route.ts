import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSource } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { chunks } from "@/lib/db/schema";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireSource(id);
  if (gate.response) return gate.response;
  const rows = await db.select().from(chunks).where(and(eq(chunks.sourceId, id)));
  rows.sort((a, b) => a.chunkIndex - b.chunkIndex);
  return NextResponse.json({
    chunks: rows.map((c) => ({
      id: c.id,
      content: c.content,
      chunkIndex: c.chunkIndex,
      page: c.page,
      startTime: c.startTime,
      endTime: c.endTime,
      heading: c.heading,
    })),
  });
}

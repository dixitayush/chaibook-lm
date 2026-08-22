import { requireNotebook } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { mapSource } from "@/lib/db/map";
import { notebooks, sources } from "@/lib/db/schema";
import { importGoogleCalendar, listGoogleCalendars } from "@/lib/google-workspace";
import { enqueueSource } from "@/lib/ingest/create";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  try {
    return NextResponse.json({ calendars: await listGoogleCalendars() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not list calendars." }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;

  const body = (await req.json().catch(() => ({}))) as { calendarId?: string; days?: number };
  let imported;
  try {
    imported = await importGoogleCalendar({ calendarId: body.calendarId, days: body.days });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Calendar import failed." }, { status: 400 });
  }

  const existing = await db.select().from(sources).where(eq(sources.notebookId, id));
  const already = existing.some((s) => {
    const meta = s.metadata && typeof s.metadata === "object" ? (s.metadata as Record<string, unknown>) : {};
    return meta.calendarId === imported.calendarId && s.type === "calendar";
  });
  if (already) {
    return NextResponse.json({ error: "That calendar is already in this notebook. Delete it first to re-import." }, { status: 409 });
  }

  const row = await enqueueSource({
    notebookId: id,
    type: "calendar",
    title: imported.title,
    content: imported.text,
    metadata: {
      calendarId: imported.calendarId,
      calendarName: imported.title,
      eventCount: imported.eventCount,
    },
    userId: gate.user?.id,
    authorName: gate.user?.name,
  });
  await db.update(notebooks).set({ updatedAt: Date.now() }).where(eq(notebooks.id, id));
  return NextResponse.json({ source: mapSource(row), sources: [mapSource(row)], imported: 1 });
}

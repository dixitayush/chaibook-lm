import { requireNotebook } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { mapSource } from "@/lib/db/map";
import { notebooks, sources } from "@/lib/db/schema";
import { importDriveFiles, listDriveFolder } from "@/lib/google-workspace";
import { enqueueSource } from "@/lib/ingest/create";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const folderId = new URL(req.url).searchParams.get("folderId") || "root";
  try {
    return NextResponse.json(await listDriveFolder(folderId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not list Drive." }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;

  const body = (await req.json().catch(() => ({}))) as { fileIds?: string[] };
  let files;
  try {
    files = await importDriveFiles(body.fileIds || []);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Drive import failed." }, { status: 400 });
  }

  const existing = await db.select().from(sources).where(eq(sources.notebookId, id));
  const seen = new Set(
    existing
      .map((s) => {
        const meta = s.metadata && typeof s.metadata === "object" ? (s.metadata as Record<string, unknown>) : {};
        return typeof meta.driveFileId === "string" ? meta.driveFileId : "";
      })
      .filter(Boolean),
  );

  const created = [];
  for (const file of files) {
    const driveId = String(file.metadata.driveFileId || "");
    if (driveId && seen.has(driveId)) continue;
    created.push(
      await enqueueSource({
        notebookId: id,
        type: file.type,
        title: file.title,
        content: file.content ?? null,
        fileData: file.fileData ?? null,
        url: typeof file.metadata.url === "string" ? file.metadata.url : null,
        metadata: file.metadata,
        userId: gate.user?.id,
        authorName: gate.user?.name,
      }),
    );
  }

  if (!created.length) {
    return NextResponse.json({ error: "Those Drive files are already in this notebook." }, { status: 409 });
  }

  await db.update(notebooks).set({ updatedAt: Date.now() }).where(eq(notebooks.id, id));
  return NextResponse.json({ sources: created.map((row) => mapSource(row)), imported: created.length });
}

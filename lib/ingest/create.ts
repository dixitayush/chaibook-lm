import { after } from "next/server";
import { db } from "@/lib/db";
import { sources } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { indexSource } from "@/lib/ingest/pipeline";
import type { SourceType } from "@/lib/types";

export async function enqueueSource(opts: {
  notebookId: string;
  type: SourceType;
  title: string;
  url?: string | null;
  content?: string | null;
  fileData?: string | null;
  metadata?: Record<string, unknown>;
  userId?: string | null;
  authorName?: string | null;
}) {
  const now = Date.now();
  const row = {
    id: createId("src"),
    notebookId: opts.notebookId,
    type: opts.type,
    title: opts.title,
    status: "uploading",
    url: opts.url ?? null,
    content: opts.content ?? null,
    fileData: opts.fileData ?? null,
    error: null,
    metadata: opts.metadata ?? {},
    chunkCount: 0,
    userId: opts.userId ?? null,
    authorName: (opts.authorName || "").slice(0, 80),
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(sources).values(row);
  after(async () => {
    await indexSource(row.id);
  });
  return row;
}

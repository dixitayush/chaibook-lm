import { eq, sql } from "drizzle-orm";
import { db, queryRows, vectorLiteral } from "@/lib/db";
import { chunks, sources } from "@/lib/db/schema";
import { embedQuery } from "./embed";
import type { RetrievalHit, SourceType } from "@/lib/types";

const VECTOR_K = 24;
const FTS_K = 24;
const FINAL_K = 10;
const RRF_K = 60;

function rrf(rank: number) {
  return 1 / (RRF_K + rank);
}

type ChunkRow = typeof chunks.$inferSelect & { score?: number };

export async function retrieve(notebookId: string, query: string, k = FINAL_K): Promise<RetrievalHit[]> {
  const sourceRows = await db.select().from(sources).where(eq(sources.notebookId, notebookId));
  const sourceMap = new Map(sourceRows.map((s) => [s.id, s]));
  const qVec = await embedQuery(query);
  const vecSql = sql.raw(`'${vectorLiteral(qVec)}'::vector`);

  const vectorRows = queryRows<ChunkRow>(
    await db.execute(sql`
      SELECT id, source_id as "sourceId", notebook_id as "notebookId", content, chunk_index as "chunkIndex",
             page, start_time as "startTime", end_time as "endTime", heading, url, token_count as "tokenCount",
             1 - (embedding <=> ${vecSql}) as score
      FROM chunks
      WHERE notebook_id = ${notebookId}
      ORDER BY embedding <=> ${vecSql}
      LIMIT ${VECTOR_K}
    `),
  );

  let ftsRows: ChunkRow[] = [];
  try {
    ftsRows = queryRows<ChunkRow>(
      await db.execute(sql`
        SELECT id, source_id as "sourceId", notebook_id as "notebookId", content, chunk_index as "chunkIndex",
               page, start_time as "startTime", end_time as "endTime", heading, url, token_count as "tokenCount",
               ts_rank(to_tsvector('english', content), websearch_to_tsquery('english', ${query})) as score
        FROM chunks
        WHERE notebook_id = ${notebookId}
          AND to_tsvector('english', content) @@ websearch_to_tsquery('english', ${query})
        ORDER BY score DESC
        LIMIT ${FTS_K}
      `),
    );
  } catch {
    ftsRows = [];
  }

  const fused = new Map<string, { rrf: number; vector: number; bm25: number }>();
  vectorRows.forEach((row, i) => {
    const cur = fused.get(row.id) ?? { rrf: 0, vector: 0, bm25: 0 };
    cur.rrf += rrf(i + 1);
    cur.vector = Number(row.score ?? 0);
    fused.set(row.id, cur);
  });
  ftsRows.forEach((row, i) => {
    const cur = fused.get(row.id) ?? { rrf: 0, vector: 0, bm25: 0 };
    cur.rrf += rrf(i + 1);
    cur.bm25 = Number(row.score ?? 0);
    fused.set(row.id, cur);
  });

  const byId = new Map<string, ChunkRow>([...vectorRows, ...ftsRows].map((r) => [r.id, r]));
  const ranked = [...fused.entries()]
    .sort((a, b) => b[1].rrf - a[1].rrf)
    .map(([id, scores]) => {
      const row = byId.get(id)!;
      const source = sourceMap.get(row.sourceId);
      const meta = (source?.metadata ?? {}) as { videoId?: string };
      return {
        n: 0,
        chunkId: row.id,
        sourceId: row.sourceId,
        sourceTitle: source?.title ?? "Source",
        sourceType: (source?.type ?? "text") as SourceType,
        excerpt: row.content.slice(0, 420),
        score: scores.rrf,
        vectorScore: scores.vector,
        bm25Score: scores.bm25,
        rrfScore: scores.rrf,
        page: row.page ?? undefined,
        startTime: row.startTime ?? undefined,
        endTime: row.endTime ?? undefined,
        heading: row.heading ?? undefined,
        url: row.url ?? source?.url ?? undefined,
        videoId: meta.videoId,
      } satisfies RetrievalHit;
    });

  const picked: RetrievalHit[] = [];
  const seenSources = new Set<string>();
  for (const hit of ranked) {
    if (picked.length >= k) break;
    if (!seenSources.has(hit.sourceId) || picked.length < Math.ceil(k / 2)) {
      picked.push(hit);
      seenSources.add(hit.sourceId);
    }
  }
  for (const hit of ranked) {
    if (picked.length >= k) break;
    if (!picked.some((p) => p.chunkId === hit.chunkId)) picked.push(hit);
  }

  return picked.map((h, i) => ({ ...h, n: i + 1 }));
}

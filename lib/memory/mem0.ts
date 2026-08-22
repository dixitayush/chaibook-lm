import { eq, sql } from "drizzle-orm";
import { db, queryRows, vectorLiteral } from "@/lib/db";
import { memories } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { embedQuery, embedTexts } from "@/lib/rag/embed";
import { hydrateEnv } from "@/lib/env";

type Mem0Client = {
  add: (messages: { role: string; content: string }[], opts: Record<string, unknown>) => Promise<unknown>;
  search: (
    query: string,
    opts: Record<string, unknown>,
  ) => Promise<{ results?: { memory?: string; score?: number }[] } | { memory?: string }[]>;
  deleteAll?: (opts: Record<string, unknown>) => Promise<unknown>;
};

let mem0: Mem0Client | null | undefined;

async function getMem0(): Promise<Mem0Client | null> {
  hydrateEnv();
  if (mem0 !== undefined) return mem0;
  const key = process.env.MEM0_API_KEY?.trim();
  if (!key) {
    mem0 = null;
    return null;
  }
  try {
    const mod = (await import("mem0ai")) as {
      MemoryClient?: new (opts: { apiKey: string }) => Mem0Client;
      default?: new (opts: { apiKey: string }) => Mem0Client;
    };
    const Ctor = mod.MemoryClient ?? mod.default;
    mem0 = Ctor ? new Ctor({ apiKey: key }) : null;
  } catch {
    mem0 = null;
  }
  return mem0;
}

export function hasMem0Key() {
  hydrateEnv();
  return Boolean(process.env.MEM0_API_KEY?.trim());
}

export async function searchMemories(notebookId: string, query: string, limit = 6) {
  const local = await db.select().from(memories).where(eq(memories.notebookId, notebookId));
  const pinned = local.filter((m) => m.pinned).slice(0, 4);

  let ranked = local
    .filter((m) => !m.pinned)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);

  try {
    const qVec = await embedQuery(query);
    const vecSql = sql.raw(`'${vectorLiteral(qVec)}'::vector`);
    const hits = queryRows<{ id: string }>(
      await db.execute(sql`
        SELECT id
        FROM memories
        WHERE notebook_id = ${notebookId} AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vecSql}
        LIMIT ${limit}
      `),
    );
    if (hits.length) {
      const byId = new Map(local.map((m) => [m.id, m]));
      ranked = hits.map((h) => byId.get(h.id)).filter((m): m is (typeof local)[number] => Boolean(m));
    }
  } catch {
    /* fall back to recency */
  }

  const remote: string[] = [];
  try {
    const client = await getMem0();
    if (client) {
      const raw = await client.search(query, { userId: notebookId, topK: limit });
      const rows = Array.isArray(raw) ? raw : raw.results ?? [];
      for (const row of rows) {
        if (row.memory) remote.push(row.memory);
      }
    }
  } catch {
    /* mem0 optional */
  }

  const seen = new Set<string>();
  const texts: { kind: string; content: string; pinned: boolean }[] = [];
  for (const row of [...pinned, ...ranked]) {
    if (seen.has(row.content)) continue;
    seen.add(row.content);
    texts.push({ kind: row.kind, content: row.content, pinned: Boolean(row.pinned) });
  }
  for (const content of remote) {
    if (seen.has(content)) continue;
    seen.add(content);
    texts.push({ kind: "mem0", content, pinned: false });
  }
  return texts.slice(0, limit + 4);
}

export async function writeMemory(opts: {
  notebookId: string;
  kind: "semantic" | "episodic" | "pin";
  content: string;
  pinned?: boolean;
  sourceIds?: string[];
}) {
  const [embedding] = await embedTexts([opts.content]).catch(() => [null]);
  await db.insert(memories).values({
    id: createId("mem"),
    notebookId: opts.notebookId,
    kind: opts.kind,
    content: opts.content,
    embedding: embedding ?? null,
    pinned: opts.pinned ? 1 : 0,
    metadata: { sourceIds: opts.sourceIds ?? [] },
    createdAt: Date.now(),
  });
  try {
    const client = await getMem0();
    if (client) {
      await client.add(
        [{ role: "user", content: opts.content }],
        { userId: opts.notebookId, metadata: { kind: opts.kind, sourceIds: opts.sourceIds ?? [] } },
      );
    }
  } catch {
    /* local table is source of truth if mem0 is down */
  }
}

export async function listMemories(notebookId: string) {
  const rows = await db.select().from(memories).where(eq(memories.notebookId, notebookId));
  rows.sort((a, b) => b.pinned - a.pinned || b.createdAt - a.createdAt);
  return rows;
}

export async function setPinned(id: string, pinned: boolean) {
  await db.update(memories).set({ pinned: pinned ? 1 : 0 }).where(eq(memories.id, id));
}

export async function deleteMemory(id: string) {
  await db.delete(memories).where(eq(memories.id, id));
}

export async function purgeNotebookMem0(notebookId: string) {
  try {
    const client = await getMem0();
    if (client?.deleteAll) await client.deleteAll({ userId: notebookId });
  } catch {
    /* Mem0 is optional; local tables are the source of truth */
  }
}

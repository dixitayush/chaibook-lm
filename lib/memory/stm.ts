import { createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";

export type StmTurn = { q: string; a: string; at: number };

const STM_MAX_TURNS = 12;
const STM_TTL_SEC = 2 * 60 * 60;
const STM_MAX_NOTEBOOKS = 2_000;
const LTM_TTL_SEC = 60;

function stmKey(notebookId: string) {
  return `cb:stm:${notebookId}`;
}

function ltmKey(notebookId: string, question: string) {
  const hash = createHash("sha1").update(question.slice(0, 240)).digest("hex").slice(0, 12);
  return `cb:ltm:${notebookId}:${hash}`;
}

function lruKey() {
  return "cb:stm:lru";
}

function parseTurn(raw: string): StmTurn | null {
  try {
    const row = JSON.parse(raw) as StmTurn;
    if (!row?.q || !row?.a) return null;
    return { q: String(row.q), a: String(row.a), at: Number(row.at) || Date.now() };
  } catch {
    return null;
  }
}

/** Touch the notebook STM key so Redis allkeys-lru keeps recently used desks. */
async function touch(notebookId: string) {
  const redis = await getRedis();
  if (!redis) return;
  const key = stmKey(notebookId);
  await redis.expire(key, STM_TTL_SEC);
  await redis.zAdd(lruKey(), { score: Date.now(), value: notebookId });
}

async function evictColdNotebooks() {
  const redis = await getRedis();
  if (!redis) return;
  const extra = (await redis.zCard(lruKey())) - STM_MAX_NOTEBOOKS;
  if (extra <= 0) return;
  const cold = await redis.zRange(lruKey(), 0, extra - 1);
  if (!cold.length) return;
  const pipeline = redis.multi();
  for (const id of cold) {
    pipeline.del(stmKey(id));
    pipeline.zRem(lruKey(), id);
  }
  await pipeline.exec();
}

export async function readShortTerm(notebookId: string): Promise<StmTurn[]> {
  const redis = await getRedis();
  if (!redis) return [];
  try {
    const rows = await redis.lRange(stmKey(notebookId), 0, STM_MAX_TURNS - 1);
    await touch(notebookId);
    return rows.map(parseTurn).filter((x): x is StmTurn => Boolean(x)).reverse();
  } catch {
    return [];
  }
}

export function formatShortTerm(turns: StmTurn[]) {
  if (!turns.length) return "";
  const lines = ["Short-term memory (this notebook session, Redis LRU):"];
  for (const turn of turns.slice(0, STM_MAX_TURNS)) {
    lines.push(`- Q: ${turn.q.slice(0, 180)}`);
    lines.push(`  A: ${turn.a.slice(0, 280)}`);
  }
  return lines.join("\n");
}

export async function pushShortTerm(notebookId: string, question: string, answer: string) {
  const redis = await getRedis();
  if (!redis) return;
  const q = question.trim().slice(0, 800);
  const a = answer.trim().slice(0, 1_400);
  if (!q || !a) return;
  try {
    const key = stmKey(notebookId);
    await redis.lPush(key, JSON.stringify({ q, a, at: Date.now() } satisfies StmTurn));
    await redis.lTrim(key, 0, STM_MAX_TURNS - 1);
    await touch(notebookId);
    await evictColdNotebooks();
  } catch {
    /* STM is best-effort */
  }
}

export async function clearShortTerm(notebookId: string) {
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.del(stmKey(notebookId));
    await redis.zRem(lruKey(), notebookId);
    await bustMemoryCache(notebookId);
  } catch {
    /* ignore */
  }
}

export async function cachedLongTerm(notebookId: string, question: string, build: () => Promise<string>) {
  const redis = await getRedis();
  const key = ltmKey(notebookId, question);
  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit != null) return hit;
    } catch {
      /* rebuild */
    }
  }
  const value = await build();
  if (redis) {
    try {
      await redis.set(key, value, { EX: LTM_TTL_SEC });
    } catch {
      /* ignore */
    }
  }
  return value;
}

export async function bustMemoryCache(notebookId: string) {
  const redis = await getRedis();
  if (!redis) return;
  try {
    const keys = await redis.keys(`cb:ltm:${notebookId}:*`);
    if (keys.length) await redis.del(keys);
  } catch {
    /* ignore */
  }
}

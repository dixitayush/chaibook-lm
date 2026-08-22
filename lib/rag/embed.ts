import { getLlm } from "@/lib/llm/client";
import { VECTOR_DIMS } from "@/lib/db/schema";

function l2(vec: number[]) {
  let s = 0;
  for (const v of vec) s += v * v;
  const n = Math.sqrt(s) || 1;
  return vec.map((v) => v / n);
}

export function toVector(vec: number[], dims = VECTOR_DIMS): number[] {
  const v = l2(vec);
  if (v.length === dims) return v;
  if (v.length > dims) return v.slice(0, dims);
  return v.concat(new Array(dims - v.length).fill(0));
}

export function cosine(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const llm = getLlm();
  const out: number[][] = [];
  const batchSize = 32;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map((t) => t.slice(0, 7000));
    const res = await llm.client.embeddings.create({
      model: llm.embedModel,
      input: batch,
    });
    const ordered = [...res.data].sort((a, b) => a.index - b.index);
    for (const row of ordered) out.push(toVector(row.embedding));
  }
  return out;
}

export async function embedQuery(q: string) {
  const [v] = await embedTexts([q]);
  return v;
}

export function parseEmbedding(raw: string | number[] | null | undefined): number[] {
  if (Array.isArray(raw)) return toVector(raw);
  if (!raw) return toVector([]);
  try {
    return toVector(JSON.parse(raw) as number[]);
  } catch {
    return toVector([]);
  }
}

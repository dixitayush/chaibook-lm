import { chatJson } from "@/lib/llm/client";
import type { RetrievalHit } from "@/lib/types";

export const PASS_SCORE = 6;
export const MAX_ATTEMPTS = 3;

export type JudgeVerdict = {
  score: number;
  grounded: number;
  complete: number;
  reasons: string;
  rephrase: string;
};

export async function judgeAnswer(opts: {
  question: string;
  answer: string;
  hits: RetrievalHit[];
  mcp?: string;
}): Promise<JudgeVerdict> {
  const excerpts = [
    ...opts.hits.slice(0, 8).map((h) => `[${h.n}] ${h.sourceTitle}: ${h.excerpt.slice(0, 280)}`),
    opts.mcp ? `External tools:\n${opts.mcp.slice(0, 2000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const data = await chatJson<JudgeVerdict>(
      `You grade a grounded RAG answer 1-10.
score = overall (grounded in excerpts, complete vs the question, citations present).
grounded and complete are 1-10.
If score is 6 or below, rephrase is a better retrieval query.
If the answer honestly says the sources lack the fact, that can still score above 6.
Return JSON only.`,
      `Question: ${opts.question}\n\nExcerpts:\n${excerpts}\n\nAnswer:\n${opts.answer.slice(0, 4000)}\n\nJSON: {"score":0,"grounded":0,"complete":0,"reasons":"","rephrase":""}`,
    );
    const score = clamp(Number(data.score) || 0);
    return {
      score,
      grounded: clamp(Number(data.grounded) || score),
      complete: clamp(Number(data.complete) || score),
      reasons: String(data.reasons || "").slice(0, 400),
      rephrase: String(data.rephrase || "").trim(),
    };
  } catch {
    return {
      score: 7,
      grounded: 7,
      complete: 7,
      reasons: "Judge unavailable; accepted the draft.",
      rephrase: "",
    };
  }
}

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(10, Math.round(n)));
}

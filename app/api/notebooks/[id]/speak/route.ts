import { requireNotebook } from "@/lib/auth";
import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { chatText, hasLlmKey } from "@/lib/llm/client";
import { synthesizeSegment } from "@/lib/llm/tts";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  if (!hasLlmKey()) {
    return NextResponse.json({ error: "Add an API key to speak answers." }, { status: 400 });
  }

  const body = (await req.json()) as { text?: string; question?: string };
  const text = (body.text || "").trim();
  if (text.length < 8) {
    return NextResponse.json({ error: "Nothing to speak yet." }, { status: 400 });
  }

  const script = await chatText(
    `You rewrite a grounded research answer as a spoken summary.
Rules:
- 80 to 160 words, natural speech, contractions allowed.
- No markdown, no bullet symbols, no citation numbers like [1] or [2].
- Do not invent facts. Only use what is in the written answer.
- If the answer says the sources do not cover something, say that out loud.
- You may name a source in passing ("the paper says", "the video notes") but never read URLs.
- Sound like a calm host summarizing for someone listening, not reading a document.
Return ONLY the spoken script.`,
    `${body.question ? `The user asked: ${body.question.slice(0, 500)}\n\n` : ""}Written answer:\n${text.slice(0, 6000)}`,
    0.4,
  );

  const spoken = script.replace(/\s+/g, " ").trim() || text.replace(/\[\d+\]/g, "").slice(0, 1200);
  const audio = await synthesizeSegment(spoken, "female");

  return NextResponse.json({
    script: spoken,
    audioBase64: audio.audioBase64 ?? null,
    mimeType: audio.mimeType ?? "audio/mpeg",
  });
}

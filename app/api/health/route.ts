import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { hydrateEnv } from "@/lib/env";
import { hasLlmKey } from "@/lib/llm/client";
import { hasMem0Key } from "@/lib/memory/mem0";
import { gmailOAuthConfigured } from "@/lib/gmail";
import { redisReady } from "@/lib/redis";

export const runtime = "nodejs";

export async function GET() {
  hydrateEnv();
  let postgres = false;
  try {
    await ensureSchema();
    await sql`select 1`;
    postgres = true;
  } catch {
    postgres = false;
  }
  const redis = await redisReady();
  return NextResponse.json({
    llm: hasLlmKey(),
    postgres,
    redis,
    mem0: hasMem0Key(),
    gmail: gmailOAuthConfigured(),
    vector: "pgvector",
    provider: process.env.OPENAI_API_KEY
      ? "openai"
      : process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
        ? "gemini"
        : null,
  });
}

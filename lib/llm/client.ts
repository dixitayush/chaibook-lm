import OpenAI from "openai";
import { hydrateLlmEnv, llmKeyStatus } from "@/lib/env";

export type ProviderKind = "openai" | "gemini";

export type LlmConfig = {
  client: OpenAI;
  kind: ProviderKind;
  chatModel: string;
  embedModel: string;
  tts: boolean;
  embedDims: number;
};

export function hasLlmKey() {
  const status = llmKeyStatus();
  return status.openai || status.gemini;
}

export function getLlm(): LlmConfig {
  hydrateLlmEnv();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      kind: "openai",
      chatModel: process.env.CHAT_MODEL || "gpt-4o-mini",
      embedModel: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
      tts: true,
      embedDims: 1536,
    };
  }

  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)?.trim();
  if (geminiKey) {
    return {
      client: new OpenAI({
        apiKey: geminiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }),
      kind: "gemini",
      chatModel: process.env.CHAT_MODEL || "gemini-2.0-flash",
      embedModel: process.env.EMBEDDING_MODEL || "text-embedding-004",
      tts: false,
      embedDims: 768,
    };
  }

  throw new Error(
    "No LLM key found. Save OPENAI_API_KEY or GEMINI_API_KEY in chaibook-lm/.env or .env.local (the file on disk was empty), then retry. A restart is not required after save.",
  );
}

export async function chatText(system: string, user: string, temperature = 0.3) {
  const llm = getLlm();
  const res = await llm.client.chat.completions.create({
    model: llm.chatModel,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

export async function chatJson<T>(system: string, user: string): Promise<T> {
  const raw = await chatText(
    `${system}\n\nReturn ONLY valid JSON. No markdown fences.`,
    user,
    0.2,
  );
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

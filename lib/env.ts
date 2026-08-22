import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE_KEYS = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "DATABASE_URL",
  "MEM0_API_KEY",
  "CHAT_MODEL",
  "EMBEDDING_MODEL",
  "APP_URL",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "RESEND_API_KEY",
  "MAIL_FROM",
  "REDIS_URL",
] as const;

function parseEnvFile(path: string) {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf("=");
    if (eq < 1) continue;
    const key = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function hydrateEnv() {
  const root = process.cwd();
  const fromFiles = {
    ...parseEnvFile(resolve(root, ".env")),
    ...parseEnvFile(resolve(root, ".env.local")),
  };
  for (const key of FILE_KEYS) {
    const fileVal = fromFiles[key]?.trim();
    if (fileVal) process.env[key] = fileVal;
  }
}

export function hydrateLlmEnv() {
  hydrateEnv();
}

export function llmKeyStatus() {
  hydrateEnv();
  return {
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    gemini: Boolean(
      process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
    ),
  };
}

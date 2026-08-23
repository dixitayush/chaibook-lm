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

const BIND_HOSTS = new Set(["0.0.0.0", "::"]);

function hostnameOf(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isBindHost(value: string): boolean {
  return BIND_HOSTS.has(hostnameOf(value));
}

function originFromHeaders(req?: Request): string | null {
  if (!req) return null;
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
    .split(",")[0]
    .trim();
  if (!host || isBindHost(host)) return null;
  const proto =
    (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim() ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`.replace(/\/$/, "");
}

/** Browser-reachable origin. Never the Next.js bind address (0.0.0.0 / ::). */
export function publicOrigin(req?: Request): string {
  hydrateEnv();
  // Prefer the host the browser actually used. Next.js standalone sets
  // HOSTNAME=0.0.0.0, so `new URL(req.url).origin` becomes https://0.0.0.0:3000.
  const fromReq = originFromHeaders(req);
  if (fromReq) return fromReq;

  const configured = (process.env.APP_URL || "").trim().replace(/\/$/, "");
  if (configured && !isBindHost(configured)) return configured;

  return "http://localhost:3000";
}

export function sanitizePublicOrigin(origin: string | undefined, req?: Request): string {
  const fallback = publicOrigin(req);
  if (!origin?.trim()) return fallback;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    if (isBindHost(url.hostname)) return fallback;
    return `${url.protocol}//${url.host}`;
  } catch {
    return fallback;
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

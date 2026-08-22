import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { mcpServers } from "@/lib/db/schema";

export type McpRow = typeof mcpServers.$inferSelect;
export type McpTool = { name: string; description: string };

function spawnEnv(extra: Record<string, string>) {
  const base = getDefaultEnvironment();
  const out: Record<string, string> = { ...base };
  if (process.env.PATH) out.PATH = process.env.PATH;
  if (process.env.HOME) out.HOME = process.env.HOME;
  for (const [k, v] of Object.entries(extra)) {
    if (v) out[k] = v;
  }
  return out;
}

function stdioArgs(row: McpRow) {
  const args = Array.isArray(row.args) ? [...row.args] : [];
  if (row.kind === "postgres") {
    const uri = row.env?.POSTGRES_CONNECTION_STRING || row.extra?.connection || "";
    if (uri && !args.includes(uri)) args.push(uri);
  }
  return args;
}

function httpHeaders(row: McpRow): Record<string, string> {
  const env = row.env || {};
  const extra = row.extra || {};
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(extra)) {
    const match = /^header:(.+)$/i.exec(key);
    if (match && value) headers[match[1]] = value;
  }
  if (env.HEADER_AUTHORIZATION) headers.Authorization = env.HEADER_AUTHORIZATION;
  else if (!headers.Authorization) {
    const token = env.AUTHORIZATION || env.NOTION_TOKEN || env.GITHUB_PERSONAL_ACCESS_TOKEN || "";
    if (token) {
      headers.Authorization = /^(Bearer |Basic |token )/i.test(token) ? token : `Bearer ${token}`;
    }
  }
  return headers;
}

async function connect(row: McpRow) {
  const client = new Client({ name: "chaibook-lm", version: "1.0.0" });
  if (row.transport === "http") {
    if (!row.url) throw new Error("HTTP MCP URL is missing.");
    const url = new URL(row.url);
    const opts = { requestInit: { headers: httpHeaders(row) } };
    try {
      const transport = new StreamableHTTPClientTransport(url, opts);
      await client.connect(transport);
    } catch {
      await client.close().catch(() => undefined);
      const retry = new Client({ name: "chaibook-lm", version: "1.0.0" });
      const sse = new SSEClientTransport(url, { requestInit: { headers: httpHeaders(row) } });
      await retry.connect(sse);
      return retry;
    }
    return client;
  }
  const command = row.command?.trim();
  if (!command) throw new Error("MCP command is missing.");
  const transport = new StdioClientTransport({
    command,
    args: stdioArgs(row),
    env: spawnEnv(row.env || {}),
    stderr: "pipe",
    ...(row.extra?.cwd ? { cwd: row.extra.cwd } : {}),
  });
  await client.connect(transport);
  return client;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

export async function withMcpClient<T>(row: McpRow, fn: (client: Client) => Promise<T>, ms = 25_000): Promise<T> {
  const client = await withTimeout(connect(row), 45_000, "MCP connect");
  try {
    return await withTimeout(fn(client), ms, "MCP call");
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function listMcpTools(row: McpRow): Promise<McpTool[]> {
  return withMcpClient(row, async (client) => {
    const res = await client.listTools();
    return (res.tools || []).map((t) => ({
      name: t.name,
      description: (t.description || "").slice(0, 400),
    }));
  });
}

export function toolResultText(result: unknown) {
  if (result == null) return "";
  if (typeof result === "string") return result.slice(0, 12_000);
  if (typeof result !== "object") return String(result).slice(0, 12_000);
  const r = result as { content?: unknown; structuredContent?: unknown; toolResult?: unknown };
  if (typeof r.structuredContent === "string") return r.structuredContent.slice(0, 12_000);
  if (r.structuredContent) {
    try {
      return JSON.stringify(r.structuredContent, null, 2).slice(0, 12_000);
    } catch {
      /* fall through */
    }
  }
  if (r.toolResult != null) {
    try {
      return (typeof r.toolResult === "string" ? r.toolResult : JSON.stringify(r.toolResult, null, 2)).slice(0, 12_000);
    } catch {
      /* fall through */
    }
  }
  const content = r.content;
  if (!Array.isArray(content)) return JSON.stringify(result).slice(0, 12_000);
  const parts = content.map((part) => {
    if (part && typeof part === "object" && "text" in part) return String((part as { text: string }).text);
    try {
      return JSON.stringify(part);
    } catch {
      return String(part);
    }
  });
  return parts.join("\n").slice(0, 12_000);
}

export async function callMcpTool(row: McpRow, name: string, args: Record<string, unknown>) {
  return withMcpClient(row, async (client) => {
    const res = await client.callTool({ name, arguments: args });
    return toolResultText(res);
  });
}

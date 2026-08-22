import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mcpServers } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { listMcpTools, type McpRow } from "./client";
import { mergeEnv, toPublic, type McpServerPublic } from "./serialize";
import { presetByKind, type McpTransport } from "./presets";

export type McpCreateInput = {
  notebookId: string;
  kind?: string;
  name?: string;
  transport?: string;
  command?: string | null;
  args?: string[] | string;
  url?: string | null;
  env?: Record<string, string>;
  extra?: Record<string, string>;
  enabled?: boolean;
  probe?: boolean;
};

function asArgs(value: string[] | string | undefined, fallback: string[]) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return fallback;
}

export async function createMcpServer(input: McpCreateInput): Promise<McpServerPublic> {
  const preset = presetByKind(input.kind || "custom");
  const transport = (input.transport === "http" || input.transport === "stdio" ? input.transport : preset.transport) as McpTransport;
  const args = asArgs(input.args, [...(preset.args || [])]);
  const command = (input.command || preset.command || "").trim() || null;
  const url = (input.url || "").trim() || null;

  if (transport === "http" && !url) throw new Error("HTTP MCP URL is required.");
  if (transport === "stdio" && !command) throw new Error("A stdio command is required (for example npx).");

  const now = Date.now();
  const row: McpRow = {
    id: createId("mcp"),
    notebookId: input.notebookId,
    name: (input.name || preset.name).slice(0, 80),
    kind: preset.kind,
    transport,
    command,
    args,
    url,
    env: mergeEnv({}, input.env),
    extra: input.extra && typeof input.extra === "object" ? input.extra : {},
    enabled: input.enabled === false ? 0 : 1,
    status: "idle",
    tools: [],
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(mcpServers).values(row);

  if (input.probe === false) return toPublic(row);

  try {
    const tools = await listMcpTools(row);
    await db
      .update(mcpServers)
      .set({ tools, status: "connected", error: null, updatedAt: Date.now() })
      .where(eq(mcpServers.id, row.id));
    return toPublic({ ...row, tools, status: "connected", error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not connect";
    await db
      .update(mcpServers)
      .set({ status: "error", error: message, updatedAt: Date.now() })
      .where(eq(mcpServers.id, row.id));
    return toPublic({ ...row, status: "error", error: message });
  }
}

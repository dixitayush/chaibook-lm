import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mcpServers } from "@/lib/db/schema";
import { chatJson } from "@/lib/llm/client";
import { callMcpTool, listMcpTools } from "./client";
import type { McpRow } from "./client";

type PlannedCall = { serverId: string; tool: string; args: Record<string, unknown>; reason: string };

function asArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export async function gatherMcpContext(notebookId: string, question: string, serverIds?: string[]) {
  const rows = await db.select().from(mcpServers).where(eq(mcpServers.notebookId, notebookId));
  const live = rows.filter((r) => Boolean(r.enabled) && (!serverIds?.length || serverIds.includes(r.id)));
  if (!live.length) return { text: "", used: [] as string[] };

  for (const server of live) {
    if (server.tools?.length) continue;
    try {
      const tools = await listMcpTools(server);
      server.tools = tools;
      await db
        .update(mcpServers)
        .set({ tools, status: "connected", error: null, updatedAt: Date.now() })
        .where(eq(mcpServers.id, server.id));
    } catch {
      /* planner can still skip a server whose catalog is empty */
    }
  }

  const catalog = live
    .map((s) => {
      const tools = (s.tools || []).slice(0, 24).map((t) => `  - ${t.name}: ${t.description || "no description"}`).join("\n");
      const extra = Object.entries(s.extra || {})
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      return `Server ${s.id} (${s.name}, ${s.kind})${extra ? ` [${extra}]` : ""}:\n${tools || "  (tools unknown)"}`;
    })
    .join("\n");

  let plan: PlannedCall[] = [];
  try {
    const data = await chatJson<{ calls?: PlannedCall[] }>(
      `You route a notebook question to MCP tools. Pick at most 3 calls that would fetch live context.
Only use tools from the catalog. Prefer search/list/get/read tools. Never pick delete/update/write/create unless the user clearly asks to change something.
If nothing is relevant, return {"calls":[]}.
Return JSON only.`,
      `Question: ${question}\n\n${catalog}\n\nJSON: {"calls":[{"serverId":"","tool":"","args":{},"reason":""}]}`,
    );
    plan = Array.isArray(data.calls) ? data.calls.slice(0, 3) : [];
  } catch {
    plan = [];
  }

  const byId = new Map(live.map((s) => [s.id, s]));
  const used: string[] = [];
  const blocks: string[] = [];

  for (const call of plan) {
    const server = byId.get(call.serverId);
    if (!server || !call.tool) continue;
    try {
      const text = await callMcpTool(server as McpRow, call.tool, asArgs(call.args));
      if (!text.trim()) continue;
      used.push(`${server.name} · ${call.tool}`);
      blocks.push(`[${server.name} / ${call.tool}]\n${text.slice(0, 3500)}`);
    } catch {
      /* skip a failed tool and keep answering from notebook sources */
    }
  }

  if (!blocks.length) return { text: "", used };
  return {
    text: `External tools (MCP live context):\n${blocks.join("\n\n")}`,
    used,
  };
}

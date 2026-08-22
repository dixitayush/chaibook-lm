import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireNotebook, requireNotebookOwner } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { mcpServers } from "@/lib/db/schema";
import { createMcpServer } from "@/lib/mcp/create";
import { parseMcpConfig } from "@/lib/mcp/from-json";
import { MCP_PRESETS } from "@/lib/mcp/presets";
import { toPublic } from "@/lib/mcp/serialize";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const rows = await db.select().from(mcpServers).where(eq(mcpServers.notebookId, id));
  rows.sort((a, b) => a.createdAt - b.createdAt);
  return NextResponse.json({
    role: gate.role,
    presets: MCP_PRESETS,
    servers: rows.map(toPublic),
  });
}

export async function POST(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebookOwner(id);
  if (gate.response) return gate.response;

  const body = (await req.json().catch(() => ({}))) as {
    json?: string;
    kind?: string;
    name?: string;
    transport?: string;
    command?: string;
    args?: string[] | string;
    url?: string;
    env?: Record<string, string>;
    extra?: Record<string, string>;
    enabled?: boolean;
  };

  if (typeof body.json === "string" && body.json.trim()) {
    let parsed;
    try {
      parsed = parseMcpConfig(body.json);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid MCP JSON" }, { status: 400 });
    }
    const probe = parsed.length === 1;
    const servers = [];
    for (const item of parsed) {
      servers.push(
        await createMcpServer({
          notebookId: id,
          kind: item.kind,
          name: item.name,
          transport: item.transport,
          command: item.command,
          args: item.args,
          url: item.url,
          env: item.env,
          extra: item.extra,
          probe,
        }),
      );
    }
    const warnings = parsed.flatMap((p) => p.warnings.map((w) => `${p.name}: ${w}`));
    return NextResponse.json({ servers, warnings });
  }

  try {
    const server = await createMcpServer({
      notebookId: id,
      kind: body.kind,
      name: body.name,
      transport: body.transport,
      command: body.command,
      args: body.args,
      url: body.url,
      env: body.env,
      extra: body.extra,
      enabled: body.enabled,
    });
    return NextResponse.json({ server });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not connect" }, { status: 400 });
  }
}

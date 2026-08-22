import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireNotebook, requireNotebookOwner } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { mcpServers } from "@/lib/db/schema";
import { listMcpTools } from "@/lib/mcp/client";
import { mergeEnv, toPublic } from "@/lib/mcp/serialize";

export const runtime = "nodejs";
export const maxDuration = 60;

type McpRoute = { params: Promise<{ id: string; mcpId: string }> };

async function loadRow(notebookId: string, mcpId: string) {
  const [row] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, mcpId), eq(mcpServers.notebookId, notebookId)));
  return row ?? null;
}

export async function PATCH(req: Request, ctx: McpRoute) {
  await ensureSchema();
  const { id, mcpId } = await ctx.params;
  const gate = await requireNotebookOwner(id);
  if (gate.response) return gate.response;
  const existing = await loadRow(id, mcpId);
  if (!existing) return NextResponse.json({ error: "Tool connection not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    transport?: string;
    command?: string;
    args?: string[] | string;
    url?: string;
    env?: Record<string, string>;
    extra?: Record<string, string>;
    enabled?: boolean;
    probe?: boolean;
  };

  const args = Array.isArray(body.args)
    ? body.args.map(String).filter(Boolean)
    : typeof body.args === "string"
      ? body.args.split(/\s+/).filter(Boolean)
      : existing.args;

  const patch = {
    name: body.name?.slice(0, 80) ?? existing.name,
    transport: body.transport === "http" || body.transport === "stdio" ? body.transport : existing.transport,
    command: body.command !== undefined ? body.command.trim() || null : existing.command,
    args,
    url: body.url !== undefined ? body.url.trim() || null : existing.url,
    env: mergeEnv(existing.env || {}, body.env),
    extra: body.extra ? { ...(existing.extra || {}), ...body.extra } : existing.extra,
    enabled: body.enabled === undefined ? existing.enabled : body.enabled ? 1 : 0,
    updatedAt: Date.now(),
  };

  await db.update(mcpServers).set(patch).where(eq(mcpServers.id, mcpId));
  let next = { ...existing, ...patch };

  if (body.probe !== false && (body.env || body.command || body.args || body.url || body.transport)) {
    try {
      const tools = await listMcpTools(next);
      await db
        .update(mcpServers)
        .set({ tools, status: "connected", error: null, updatedAt: Date.now() })
        .where(eq(mcpServers.id, mcpId));
      next = { ...next, tools, status: "connected", error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not connect";
      await db
        .update(mcpServers)
        .set({ status: "error", error: message, updatedAt: Date.now() })
        .where(eq(mcpServers.id, mcpId));
      next = { ...next, status: "error", error: message };
    }
  }

  return NextResponse.json({ server: toPublic(next) });
}

export async function DELETE(_req: Request, ctx: McpRoute) {
  await ensureSchema();
  const { id, mcpId } = await ctx.params;
  const gate = await requireNotebookOwner(id);
  if (gate.response) return gate.response;
  const existing = await loadRow(id, mcpId);
  if (!existing) return NextResponse.json({ error: "Tool connection not found." }, { status: 404 });
  await db.delete(mcpServers).where(eq(mcpServers.id, mcpId));
  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, ctx: McpRoute) {
  await ensureSchema();
  const { id, mcpId } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const existing = await loadRow(id, mcpId);
  if (!existing) return NextResponse.json({ error: "Tool connection not found." }, { status: 404 });
  return NextResponse.json({ server: toPublic(existing) });
}

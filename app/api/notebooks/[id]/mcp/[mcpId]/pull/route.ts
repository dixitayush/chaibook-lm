import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireNotebook } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { mcpServers, notebooks } from "@/lib/db/schema";
import { enqueueSource } from "@/lib/ingest/create";
import { gatherMcpContext } from "@/lib/mcp/context";
import { listMcpTools } from "@/lib/mcp/client";
import { toPublic } from "@/lib/mcp/serialize";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ id: string; mcpId: string }> }) {
  await ensureSchema();
  const { id, mcpId } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response || !gate.user) return gate.response;
  const [row] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, mcpId), eq(mcpServers.notebookId, id)));
  if (!row) return NextResponse.json({ error: "Tool connection not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { query?: string };
  const query =
    (body.query || "").trim() ||
    (row.extra?.repo ? `Summarize the current state of ${row.extra.repo}` : `Pull useful live context from ${row.name}`);

  let catalog = row.tools || [];
  if (!catalog.length) {
    try {
      catalog = await listMcpTools(row);
      await db
        .update(mcpServers)
        .set({ tools: catalog, status: "connected", error: null, updatedAt: Date.now() })
        .where(eq(mcpServers.id, mcpId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not list tools";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const ctxBlock = await gatherMcpContext(id, query, [mcpId]);
  const toolsList = catalog.map((t) => `- ${t.name}: ${t.description || ""}`).join("\n");
  const text = [
    `MCP snapshot from ${row.name} (${row.kind})`,
    query ? `Query: ${query}` : "",
    ctxBlock.text || "No live tool results. Tool catalog is below.",
    toolsList ? `\nAvailable tools:\n${toolsList}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const source = await enqueueSource({
    notebookId: id,
    type: "mcp",
    title: `${row.name} · ${query.slice(0, 60)}`,
    content: text.slice(0, 200_000),
    metadata: { heading: row.kind, url: row.url || undefined },
    userId: gate.user.id,
    authorName: gate.user.name,
  });
  await db.update(notebooks).set({ updatedAt: Date.now() }).where(eq(notebooks.id, id));

  return NextResponse.json({
    sourceId: source.id,
    used: ctxBlock.used,
    server: toPublic({ ...row, tools: catalog, status: "connected" }),
  });
}

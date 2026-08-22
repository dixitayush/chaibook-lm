import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireNotebook } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { mcpServers } from "@/lib/db/schema";
import { listMcpTools } from "@/lib/mcp/client";
import { toPublic } from "@/lib/mcp/serialize";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; mcpId: string }> }) {
  await ensureSchema();
  const { id, mcpId } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const [row] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, mcpId), eq(mcpServers.notebookId, id)));
  if (!row) return NextResponse.json({ error: "Tool connection not found." }, { status: 404 });

  try {
    const tools = await listMcpTools(row);
    await db
      .update(mcpServers)
      .set({ tools, status: "connected", error: null, updatedAt: Date.now() })
      .where(eq(mcpServers.id, mcpId));
    return NextResponse.json({ server: toPublic({ ...row, tools, status: "connected", error: null }) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not connect";
    await db
      .update(mcpServers)
      .set({ status: "error", error: message, updatedAt: Date.now() })
      .where(eq(mcpServers.id, mcpId));
    return NextResponse.json(
      { error: message, server: toPublic({ ...row, status: "error", error: message }) },
      { status: 400 },
    );
  }
}

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireNotebook } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { memories } from "@/lib/db/schema";
import { hasMem0Key, listMemories, writeMemory, setPinned, deleteMemory } from "@/lib/memory/mem0";
import { graphSnapshot, recentEpisodes } from "@/lib/memory/graph";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;

  const [rows, graph, episodes] = await Promise.all([
    listMemories(id),
    graphSnapshot(id),
    recentEpisodes(id, 12),
  ]);

  return NextResponse.json({
    mem0: hasMem0Key(),
    memories: rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      content: m.content,
      pinned: Boolean(m.pinned),
      createdAt: m.createdAt,
    })),
    graph,
    episodes: episodes.map((e) => ({
      id: e.id,
      question: e.question,
      answer: e.answer,
      summary: e.summary,
      createdAt: e.createdAt,
    })),
  });
}

export async function POST(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const body = (await req.json()) as { content?: string; kind?: "semantic" | "episodic" | "pin"; pinned?: boolean };
  const content = (body.content || "").trim();
  if (!content) return NextResponse.json({ error: "Memory content is required" }, { status: 400 });
  await writeMemory({
    notebookId: id,
    kind: body.kind || "pin",
    content,
    pinned: body.pinned ?? body.kind === "pin",
  });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const body = (await req.json()) as { memoryId?: string; pinned?: boolean };
  if (!body.memoryId) return NextResponse.json({ error: "memoryId is required" }, { status: 400 });
  const [row] = await db.select().from(memories).where(eq(memories.id, body.memoryId));
  if (!row || row.notebookId !== id) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  await setPinned(body.memoryId, Boolean(body.pinned));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const body = (await req.json()) as { memoryId?: string };
  if (!body.memoryId) return NextResponse.json({ error: "memoryId is required" }, { status: 400 });
  const [row] = await db.select().from(memories).where(eq(memories.id, body.memoryId));
  if (!row || row.notebookId !== id) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  await deleteMemory(body.memoryId);
  return NextResponse.json({ ok: true });
}

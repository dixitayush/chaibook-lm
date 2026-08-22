import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireNotebook, requireNotebookOwner } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { mapNotebook } from "@/lib/db/map";
import { mcpServers, notebooks, sources } from "@/lib/db/schema";
import { forgetNotebook } from "@/lib/memory/forget";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response || !gate.user) return gate.response;
  const src = await db.select().from(sources).where(eq(sources.notebookId, id));
  const mcp = await db.select({ enabled: mcpServers.enabled }).from(mcpServers).where(eq(mcpServers.notebookId, id));
  return NextResponse.json({
    notebook: mapNotebook(gate.notebook, {
      sourceCount: src.length,
      readyCount: src.filter((s) => s.status === "ready").length,
      role: gate.role ?? "owner",
      mcpEnabled: mcp.some((s) => Boolean(s.enabled)),
    }),
    viewer: { id: gate.user.id, name: gate.user.name, email: gate.user.email },
  });
}

export async function PATCH(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebookOwner(id);
  if (gate.response) return gate.response;
  const existing = gate.notebook;
  const body = (await req.json()) as { title?: string; description?: string; emoji?: string };
  const patch = {
    title: body.title?.slice(0, 80) ?? existing.title,
    description: body.description?.slice(0, 280) ?? existing.description,
    emoji: body.emoji ?? existing.emoji,
    updatedAt: Date.now(),
  };
  await db.update(notebooks).set(patch).where(eq(notebooks.id, id));
  return NextResponse.json({ notebook: mapNotebook({ ...existing, ...patch }, { role: "owner" }) });
}

export async function DELETE(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebookOwner(id);
  if (gate.response) return gate.response;
  await forgetNotebook(id);
  return NextResponse.json({ ok: true });
}

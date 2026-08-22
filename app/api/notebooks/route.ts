import { eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { mapNotebook } from "@/lib/db/map";
import { notebookShares, notebooks, sources, users } from "@/lib/db/schema";
import { createId } from "@/lib/id";

export const runtime = "nodejs";

async function sourceCounts(ids: string[]) {
  if (!ids.length) return new Map<string, { sourceCount: number; readyCount: number }>();
  const counts = await db
    .select({
      notebookId: sources.notebookId,
      sourceCount: sql<number>`count(*)`,
      readyCount: sql<number>`sum(case when ${sources.status} = 'ready' then 1 else 0 end)`,
    })
    .from(sources)
    .where(inArray(sources.notebookId, ids))
    .groupBy(sources.notebookId);
  return new Map(counts.map((c) => [c.notebookId, { sourceCount: Number(c.sourceCount ?? 0), readyCount: Number(c.readyCount ?? 0) }]));
}

export async function GET() {
  await ensureSchema();
  const gate = await requireUser();
  if (gate.response) return gate.response;
  const owned = await db.select().from(notebooks).where(eq(notebooks.userId, gate.user.id));
  const sharedRows = await db
    .select({
      notebook: notebooks,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(notebookShares)
    .innerJoin(notebooks, eq(notebookShares.notebookId, notebooks.id))
    .leftJoin(users, eq(notebooks.userId, users.id))
    .where(eq(notebookShares.email, gate.user.email));
  const ownedIds = new Set(owned.map((n) => n.id));
  const shared = sharedRows.filter((r) => !ownedIds.has(r.notebook.id)).map((r) => r.notebook);
  const cmap = await sourceCounts([...ownedIds, ...shared.map((n) => n.id)]);
  const ownerById = new Map(
    sharedRows.map((r) => [r.notebook.id, r.ownerName || r.ownerEmail?.split("@")[0] || "Someone"]),
  );
  const rows = [
    ...owned.map((r) =>
      mapNotebook(r, { ...cmap.get(r.id), role: "owner" as const }),
    ),
    ...shared.map((r) =>
      mapNotebook(r, {
        ...cmap.get(r.id),
        role: "collaborator" as const,
        ownerName: ownerById.get(r.id),
      }),
    ),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
  return NextResponse.json({ notebooks: rows });
}

export async function POST(req: Request) {
  await ensureSchema();
  const gate = await requireUser();
  if (gate.response) return gate.response;
  const body = (await req.json()) as { title?: string; description?: string; emoji?: string };
  const now = Date.now();
  const row = {
    id: createId("nb"),
    userId: gate.user.id,
    title: (body.title || "Untitled notebook").slice(0, 80),
    description: (body.description || "").slice(0, 280),
    emoji: body.emoji || "🍵",
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(notebooks).values(row);
  return NextResponse.json({ notebook: mapNotebook(row, { sourceCount: 0, readyCount: 0, role: "owner" }) });
}

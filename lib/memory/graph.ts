import { and, eq, sql } from "drizzle-orm";
import { db, queryRows, vectorLiteral } from "@/lib/db";
import { episodes, graphEdges, graphNodes } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { chatJson } from "@/lib/llm/client";
import { embedQuery, embedTexts } from "@/lib/rag/embed";

export type GraphNodeView = {
  id: string;
  type: string;
  name: string;
  summary: string;
  mentions: number;
};

export type GraphEdgeView = {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  fromName?: string;
  toName?: string;
};

function slug(name: string, type: string) {
  return `${type}:${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`;
}

export async function graphContext(notebookId: string, query: string) {
  const nodes = await db.select().from(graphNodes).where(eq(graphNodes.notebookId, notebookId));
  const q = query.toLowerCase();
  const hits = nodes
    .map((n) => {
      const hay = `${n.name} ${n.summary}`.toLowerCase();
      const score = hay.includes(q) ? 3 : q.split(/\s+/).filter((w) => w.length > 3 && hay.includes(w)).length;
      return { n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.n.mentions - a.n.mentions)
    .slice(0, 8)
    .map((x) => x.n);

  if (!hits.length) {
    return nodes
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 5)
      .map((n) => `${n.type} “${n.name}”: ${n.summary || "mentioned in this notebook"}`);
  }
  return hits.map((n) => `${n.type} “${n.name}”: ${n.summary || "related in the knowledge graph"}`);
}

export async function recentEpisodes(notebookId: string, limit = 4) {
  const rows = await db.select().from(episodes).where(eq(episodes.notebookId, notebookId));
  return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function relevantEpisodes(notebookId: string, query: string, limit = 3) {
  try {
    const qVec = await embedQuery(query);
    const vecSql = sql.raw(`'${vectorLiteral(qVec)}'::vector`);
    const hits = queryRows<{
      id: string;
      question: string;
      answer: string;
      summary: string;
      createdAt: number;
    }>(
      await db.execute(sql`
        SELECT id, question, answer, summary, created_at as "createdAt"
        FROM episodes
        WHERE notebook_id = ${notebookId} AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vecSql}
        LIMIT ${limit}
      `),
    );
    if (hits.length) return hits;
  } catch {
    /* recency fallback */
  }
  return recentEpisodes(notebookId, limit);
}

export async function rememberTurn(opts: {
  notebookId: string;
  question: string;
  answer: string;
  sourceIds?: string[];
}) {
  const sourceIds = [...new Set((opts.sourceIds ?? []).filter(Boolean))];
  const summary = opts.answer.replace(/\s+/g, " ").slice(0, 280);
  const [embedding] = await embedTexts([`${opts.question}\n${summary}`]).catch(() => [null]);
  await db.insert(episodes).values({
    id: createId("ep"),
    notebookId: opts.notebookId,
    question: opts.question,
    answer: opts.answer.slice(0, 8000),
    summary,
    embedding: embedding ?? null,
    createdAt: Date.now(),
    sourceIds,
  });

  try {
    const extracted = await chatJson<{
      nodes: { type: string; name: string; summary: string }[];
      edges: { from: string; to: string; type: string }[];
      semantic: string[];
    }>(
      "Extract a compact knowledge graph from the Q&A. Types: Concept, Person, Source, Fact. Edge types: RELATED_TO, MENTIONS, ABOUT. Return JSON only.",
      `Question: ${opts.question}\nAnswer: ${opts.answer.slice(0, 4000)}\nJSON: {"nodes":[{"type":"Concept","name":"","summary":""}],"edges":[{"from":"name","to":"name","type":"RELATED_TO"}],"semantic":["durable fact the user would want remembered"]}`,
    );
    const idByName = new Map<string, string>();
    for (const node of extracted.nodes?.slice(0, 8) ?? []) {
      const name = node.name.trim();
      if (!name) continue;
      const key = slug(name, node.type || "Concept");
      const existing = await db
        .select()
        .from(graphNodes)
        .where(and(eq(graphNodes.notebookId, opts.notebookId), eq(graphNodes.name, name)));
      const match = existing.find((n) => n.type === (node.type || "Concept")) ?? existing[0];
      if (match) {
        const prev = (match.metadata && typeof match.metadata === "object" ? match.metadata : {}) as Record<
          string,
          unknown
        >;
        const prevIds = Array.isArray(prev.sourceIds) ? (prev.sourceIds as string[]) : [];
        await db
          .update(graphNodes)
          .set({
            mentions: match.mentions + 1,
            summary: node.summary || match.summary,
            metadata: { ...prev, sourceIds: [...new Set([...prevIds, ...sourceIds])] },
            updatedAt: Date.now(),
          })
          .where(eq(graphNodes.id, match.id));
        idByName.set(name.toLowerCase(), match.id);
        idByName.set(key, match.id);
      } else {
        const id = createId("gnd");
        await db.insert(graphNodes).values({
          id,
          notebookId: opts.notebookId,
          type: node.type || "Concept",
          name,
          summary: node.summary || "",
          mentions: 1,
          metadata: { sourceIds },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        idByName.set(name.toLowerCase(), id);
        idByName.set(key, id);
      }
    }
    for (const edge of extracted.edges?.slice(0, 10) ?? []) {
      const fromId = idByName.get(edge.from.toLowerCase());
      const toId = idByName.get(edge.to.toLowerCase());
      if (!fromId || !toId || fromId === toId) continue;
      const already = await db
        .select()
        .from(graphEdges)
        .where(and(eq(graphEdges.fromId, fromId), eq(graphEdges.toId, toId), eq(graphEdges.type, edge.type || "RELATED_TO")));
      if (already.length) continue;
      await db.insert(graphEdges).values({
        id: createId("ged"),
        notebookId: opts.notebookId,
        fromId,
        toId,
        type: edge.type || "RELATED_TO",
        confidence: 70,
        createdAt: Date.now(),
      });
    }
    return extracted.semantic?.slice(0, 4) ?? [];
  } catch {
    return [];
  }
}

export async function graphSnapshot(notebookId: string) {
  const nodes = await db.select().from(graphNodes).where(eq(graphNodes.notebookId, notebookId));
  const edges = await db.select().from(graphEdges).where(eq(graphEdges.notebookId, notebookId));
  const names = new Map(nodes.map((n) => [n.id, n.name]));
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      summary: n.summary,
      mentions: n.mentions,
    })) satisfies GraphNodeView[],
    edges: edges.map((e) => ({
      id: e.id,
      type: e.type,
      fromId: e.fromId,
      toId: e.toId,
      fromName: names.get(e.fromId),
      toName: names.get(e.toId),
    })) satisfies GraphEdgeView[],
  };
}

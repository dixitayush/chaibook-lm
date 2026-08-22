import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artifacts,
  chunks,
  episodes,
  graphEdges,
  graphNodes,
  memories,
  messages,
  notebooks,
  sources,
} from "@/lib/db/schema";
import { purgeNotebookMem0 } from "@/lib/memory/mem0";
import { clearShortTerm } from "@/lib/memory/stm";

const GENERIC_TITLES = new Set([
  "pdf",
  "source",
  "website",
  "youtube video",
  "note",
  "transcript",
  "email",
  "gmail message",
  "calendar",
  "drive file",
]);

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function idsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

function mentionsTitle(text: string, title: string) {
  const t = title.trim();
  if (t.length < 10 || GENERIC_TITLES.has(t.toLowerCase())) return false;
  return text.toLowerCase().includes(t.toLowerCase());
}

/** Drop source vectors plus memory, episodes, and graph nodes tied to that file. */
export async function forgetSource(sourceId: string) {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!source) return;

  const notebookId = source.notebookId;
  const title = source.title || "";

  await db.delete(chunks).where(eq(chunks.sourceId, sourceId));

  const memRows = await db.select().from(memories).where(eq(memories.notebookId, notebookId));
  const memToDrop = memRows
    .filter((m) => {
      const tagged = idsIn(asObject(m.metadata).sourceIds);
      if (tagged.includes(sourceId)) return true;
      if (m.pinned) return false;
      return mentionsTitle(m.content, title);
    })
    .map((m) => m.id);
  if (memToDrop.length) await db.delete(memories).where(inArray(memories.id, memToDrop));

  const epRows = await db.select().from(episodes).where(eq(episodes.notebookId, notebookId));
  const epToDrop = epRows
    .filter((e) => idsIn(e.sourceIds).includes(sourceId) || mentionsTitle(`${e.question}\n${e.answer}`, title))
    .map((e) => e.id);
  if (epToDrop.length) await db.delete(episodes).where(inArray(episodes.id, epToDrop));

  const nodes = await db.select().from(graphNodes).where(eq(graphNodes.notebookId, notebookId));
  const dropNodeIds: string[] = [];
  for (const node of nodes) {
    const meta = asObject(node.metadata);
    const tagged = idsIn(meta.sourceIds);
    const isThisSource =
      tagged.includes(sourceId) ||
      (node.type.toLowerCase() === "source" && mentionsTitle(node.name, title)) ||
      mentionsTitle(`${node.name} ${node.summary}`, title);
    if (!isThisSource) continue;
    if (tagged.length > 1) {
      await db
        .update(graphNodes)
        .set({
          metadata: { ...meta, sourceIds: tagged.filter((id) => id !== sourceId) },
          updatedAt: Date.now(),
        })
        .where(eq(graphNodes.id, node.id));
    } else {
      dropNodeIds.push(node.id);
    }
  }
  if (dropNodeIds.length) {
    await db.delete(graphEdges).where(inArray(graphEdges.fromId, dropNodeIds));
    await db.delete(graphEdges).where(inArray(graphEdges.toId, dropNodeIds));
    await db.delete(graphNodes).where(inArray(graphNodes.id, dropNodeIds));
  }
}

/** Remove every source in a notebook, then sweep leftover vectors, episodes, and unpinned memory. */
export async function forgetAllSources(notebookId: string) {
  const rows = await db.select({ id: sources.id }).from(sources).where(eq(sources.notebookId, notebookId));
  for (const row of rows) await forgetSource(row.id);
  await db.delete(chunks).where(eq(chunks.notebookId, notebookId));
  await db.delete(sources).where(eq(sources.notebookId, notebookId));
  await sweepEmptyNotebook(notebookId);
}

async function forgetArtifacts(notebookId: string) {
  await db.delete(artifacts).where(eq(artifacts.notebookId, notebookId));
}

/** After the last source is gone, leftover notebook memory, studio artifacts, and orphan vectors leave too. */
export async function sweepEmptyNotebook(notebookId: string) {
  const left = await db.select({ id: sources.id }).from(sources).where(eq(sources.notebookId, notebookId));
  if (left.length) return;

  await db.delete(chunks).where(eq(chunks.notebookId, notebookId));
  const leftoverMem = await db.select().from(memories).where(eq(memories.notebookId, notebookId));
  const unpinned = leftoverMem.filter((m) => !m.pinned).map((m) => m.id);
  if (unpinned.length) await db.delete(memories).where(inArray(memories.id, unpinned));
  await db.delete(episodes).where(eq(episodes.notebookId, notebookId));
  await db.delete(graphEdges).where(eq(graphEdges.notebookId, notebookId));
  await db.delete(graphNodes).where(eq(graphNodes.notebookId, notebookId));
  await forgetArtifacts(notebookId);
}

/** Clear chat: messages, episodic vectors, unpinned turn-memory, the graph, and Studio artifacts. Pins stay. */
export async function forgetChat(notebookId: string) {
  await db.delete(messages).where(eq(messages.notebookId, notebookId));
  await db.delete(episodes).where(eq(episodes.notebookId, notebookId));
  const memRows = await db.select().from(memories).where(eq(memories.notebookId, notebookId));
  const drop = memRows.filter((m) => !m.pinned && (m.kind === "episodic" || m.kind === "semantic")).map((m) => m.id);
  if (drop.length) await db.delete(memories).where(inArray(memories.id, drop));
  await db.delete(graphEdges).where(eq(graphEdges.notebookId, notebookId));
  await db.delete(graphNodes).where(eq(graphNodes.notebookId, notebookId));
  await forgetArtifacts(notebookId);
  await clearShortTerm(notebookId);
}

/** Delete a notebook and every vector, memory, message, artifact, and Mem0 record scoped to it. */
export async function forgetNotebook(notebookId: string) {
  await purgeNotebookMem0(notebookId);
  await clearShortTerm(notebookId);
  await db.delete(chunks).where(eq(chunks.notebookId, notebookId));
  await db.delete(graphEdges).where(eq(graphEdges.notebookId, notebookId));
  await db.delete(graphNodes).where(eq(graphNodes.notebookId, notebookId));
  await db.delete(episodes).where(eq(episodes.notebookId, notebookId));
  await db.delete(memories).where(eq(memories.notebookId, notebookId));
  await db.delete(messages).where(eq(messages.notebookId, notebookId));
  await forgetArtifacts(notebookId);
  await db.delete(sources).where(eq(sources.notebookId, notebookId));
  await db.delete(notebooks).where(eq(notebooks.id, notebookId));
}

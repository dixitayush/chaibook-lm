import { searchMemories, writeMemory } from "./mem0";
import { graphContext, relevantEpisodes, rememberTurn } from "./graph";
import { bustMemoryCache, cachedLongTerm, formatShortTerm, pushShortTerm, readShortTerm } from "./stm";

export async function memoryBlock(notebookId: string, question: string) {
  const [shortTerm, longTerm] = await Promise.all([
    readShortTerm(notebookId),
    cachedLongTerm(notebookId, question, async () => {
      const [semantic, graph, episodes] = await Promise.all([
        searchMemories(notebookId, question),
        graphContext(notebookId, question),
        relevantEpisodes(notebookId, question, 3),
      ]);
      const lines: string[] = [];
      if (semantic.length) {
        lines.push("Long-term memory (Mem0 + pinned facts):");
        for (const m of semantic) lines.push(`- (${m.kind}${m.pinned ? ", pinned" : ""}) ${m.content}`);
      }
      if (graph.length) {
        lines.push("Knowledge graph:");
        for (const g of graph) lines.push(`- ${g}`);
      }
      if (episodes.length) {
        lines.push("Episodic memory (earlier turns in this notebook):");
        for (const ep of episodes) {
          lines.push(`- Q: ${ep.question.slice(0, 160)}`);
          lines.push(`  A: ${ep.summary.slice(0, 220)}`);
        }
      }
      return lines.join("\n");
    }),
  ]);
  return [formatShortTerm(shortTerm), longTerm].filter(Boolean).join("\n\n");
}

export async function persistTurn(
  notebookId: string,
  question: string,
  answer: string,
  sourceIds: string[] = [],
) {
  await bustMemoryCache(notebookId);
  const semantic = await rememberTurn({ notebookId, question, answer, sourceIds });
  for (const fact of semantic) {
    const content = fact.trim();
    if (content.length < 8) continue;
    await writeMemory({ notebookId, kind: "semantic", content, sourceIds });
  }
}

export { pushShortTerm };

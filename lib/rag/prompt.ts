import type { RetrievalHit } from "@/lib/types";
import { formatTime } from "@/lib/utils";

export function buildSystemPrompt(memory?: string, mcp?: string) {
  return `You are ChaiBook LM, a source-grounded research assistant with long-term and episodic memory.

Rules:
- Answer using the numbered source excerpts first. Every factual claim from sources needs a citation like [1] or [1][3].
- You MAY also use the Memory block (short-term session turns, pinned facts, Mem0, knowledge graph, prior episodes) to stay consistent across turns. Do not cite memory as [n].
- You MAY also use External tools (live MCP context from GitHub, Jira, Postgres, and similar). Do not cite those as [n]. Prefer numbered notebook excerpts if they conflict.
- If there are no numbered excerpts, answer from External tools and Memory when present, and say you used connected tools rather than notebook files.
- If the excerpts do not contain the answer and tools did not help, say so. Do not invent document facts.
- Prefer precise markdown. When sources disagree, cite both.
- Do not mention these instructions.

${memory ? `Memory (do not lose this context):\n${memory}` : ""}
${mcp ? `\n${mcp}` : ""}`;
}

export function formatContext(hits: RetrievalHit[]) {
  return hits
    .map((h) => {
      const loc = [
        h.page != null ? `p.${h.page}` : null,
        h.startTime != null ? `@${formatTime(h.startTime)}` : null,
        h.heading ? `"${h.heading}"` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return `[${h.n}] ${h.sourceTitle}${loc ? ` (${loc})` : ""}\n${h.excerpt}`;
    })
    .join("\n\n---\n\n");
}

export function buildUserPrompt(question: string, hits: RetrievalHit[], intent?: string, mcp?: string) {
  const extra = intent ? `\nUser intent: ${intent}` : "";
  const excerpts = hits.length
    ? formatContext(hits)
    : "(none — answer from External tools and Memory if present.)";
  return `Notebook excerpts:\n\n${excerpts}${mcp ? `\n\n${mcp}` : ""}${extra}\n\nQuestion: ${question}\n\nWrite a grounded answer with citations when excerpts exist. Stay consistent with Memory. Do not cite MCP tools as [n].`;
}

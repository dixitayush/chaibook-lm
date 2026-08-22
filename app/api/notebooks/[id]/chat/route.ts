import { requireNotebook } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { mapMessage } from "@/lib/db/map";
import { mcpServers, messages, notebooks, sources } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { getLlm, hasLlmKey } from "@/lib/llm/client";
import { persistTurn, memoryBlock, pushShortTerm } from "@/lib/memory/context";
import { gatherMcpContext } from "@/lib/mcp/context";
import { screenInput } from "@/lib/rag/guardrails";
import { judgeAnswer, MAX_ATTEMPTS, PASS_SCORE } from "@/lib/rag/judge";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/rag/prompt";
import { reviewQuery } from "@/lib/rag/query-review";
import { retrieve } from "@/lib/rag/retrieve";
import { clientIp, limitOrResponse } from "@/lib/rate-limit";
import type { RetrievalHit } from "@/lib/types";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const chatLimit = await limitOrResponse(`chat:${gate.user?.id || (await clientIp(req))}`, 25, 60);
  if (chatLimit) return chatLimit;
  if (!hasLlmKey()) {
    return Response.json({ error: "Add OPENAI_API_KEY or GEMINI_API_KEY in .env.local" }, { status: 400 });
  }
  const nb = gate.notebook;

  const body = (await req.json()) as { question?: string };
  const guard = screenInput(body.question || "");
  if (!guard.ok) return Response.json({ error: guard.reason }, { status: 400 });
  const question = guard.question;

  const [readyRows, mcpRows] = await Promise.all([
    db.select().from(sources).where(eq(sources.notebookId, id)),
    db.select({ id: mcpServers.id, enabled: mcpServers.enabled }).from(mcpServers).where(eq(mcpServers.notebookId, id)),
  ]);
  const hasReady = readyRows.some((s) => s.status === "ready");
  const hasMcp = mcpRows.some((s) => Boolean(s.enabled));
  if (!hasReady && !hasMcp) {
    return Response.json({ error: "Add a source or connect an MCP tool first." }, { status: 400 });
  }

  const now = Date.now();
  await db.insert(messages).values({
    id: createId("msg"),
    notebookId: id,
    role: "user",
    content: question,
    citations: [],
    retrieval: [],
    userId: gate.user?.id ?? null,
    authorName: gate.user?.name || "",
    createdAt: now,
  });

  const history = await db.select().from(messages).where(eq(messages.notebookId, id));
  history.sort((a, b) => a.createdAt - b.createdAt);
  const recent = history.slice(-10).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const encoder = new TextEncoder();
  const assistantId = createId("msg");

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        send({ type: "status", stage: "guardrails", text: "Input passed guardrails" });
        send({ type: "status", stage: "query_review", text: "Reviewing the question" });
        let reviewed = await reviewQuery({ question, notebookTitle: nb.title });

        let hits: RetrievalHit[] = [];
        let mcp = { text: "", used: [] as string[] };
        let full = "";
        let verdict = { score: 0, grounded: 0, complete: 0, reasons: "", rephrase: "" };
        let attempts = 0;

        for (attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
          send({
            type: "status",
            stage: "retrieve",
            attempt: attempts,
            text: `Retrieving chunks (attempt ${attempts}/${MAX_ATTEMPTS})`,
          });
          const [nextHits, memory] = await Promise.all([
            retrieve(id, reviewed.retrievalQuery, 8),
            memoryBlock(id, reviewed.retrievalQuery),
          ]);
          hits = nextHits;

          if (hasMcp) {
            send({ type: "status", stage: "mcp", attempt: attempts, text: "Asking connected tools" });
            mcp = await gatherMcpContext(id, reviewed.retrievalQuery);
          }

          if (!hits.length && !mcp.text) {
            send({ type: "error", error: "No indexed chunks or tool context in this notebook yet." });
            return;
          }

          if (attempts > 1) send({ type: "reset" });
          send({
            type: "meta",
            citations: hits,
            retrieval: hits,
            memory,
            mcp: mcp.used,
            messageId: assistantId,
            query: reviewed.rewritten,
            intent: reviewed.intent,
            attempt: attempts,
          });

          send({ type: "status", stage: "generate", attempt: attempts, text: "Writing a grounded answer" });
          const llm = getLlm();
          const stream = await llm.client.chat.completions.create({
            model: llm.chatModel,
            temperature: attempts === 1 ? 0.15 : 0.25,
            stream: true,
            messages: [
              { role: "system", content: buildSystemPrompt(memory, mcp.text) },
              ...recent.slice(0, -1),
              { role: "user", content: buildUserPrompt(reviewed.rewritten, hits, reviewed.intent, mcp.text) },
            ],
          });
          full = "";
          for await (const part of stream) {
            const delta = part.choices[0]?.delta?.content ?? "";
            if (!delta) continue;
            full += delta;
            send({ type: "delta", text: delta });
          }

          send({ type: "status", stage: "judge", attempt: attempts, text: "Scoring the answer" });
          verdict = await judgeAnswer({ question, answer: full, hits, mcp: mcp.text });
          send({
            type: "score",
            score: verdict.score,
            grounded: verdict.grounded,
            complete: verdict.complete,
            reasons: verdict.reasons,
            attempt: attempts,
            pass: verdict.score > PASS_SCORE,
          });

          if (verdict.score > PASS_SCORE) break;
          if (attempts < MAX_ATTEMPTS) {
            send({
              type: "status",
              stage: "retry",
              attempt: attempts + 1,
              text: `Score ${verdict.score}/10 — rephrasing the query`,
            });
            reviewed = await reviewQuery({
              question,
              notebookTitle: nb.title,
              feedback: verdict.rephrase || verdict.reasons,
            });
          }
        }

        await db.insert(messages).values({
          id: assistantId,
          notebookId: id,
          role: "assistant",
          content: full,
          citations: hits,
          retrieval: hits,
          userId: null,
          authorName: "ChaiBook",
          createdAt: Date.now(),
        });
        await db.update(notebooks).set({ updatedAt: Date.now() }).where(eq(notebooks.id, id));
        if (full.trim()) {
          await pushShortTerm(id, question, full).catch(() => undefined);
        }

        const stored = verdict.score > PASS_SCORE;
        if (stored) {
          after(async () => {
            const sourceIds = [...new Set(hits.map((h) => h.sourceId).filter(Boolean))];
            await persistTurn(id, question, full, sourceIds).catch(() => undefined);
          });
        }

        send({
          type: "done",
          score: verdict.score,
          stored,
          attempts,
          message: mapMessage({
            id: assistantId,
            notebookId: id,
            role: "assistant",
            content: full,
            citations: hits,
            retrieval: hits,
            userId: null,
            authorName: "ChaiBook",
            createdAt: Date.now(),
          }),
        });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Generation failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

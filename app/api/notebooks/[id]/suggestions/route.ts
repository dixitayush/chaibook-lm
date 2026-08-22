import { requireNotebook } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { chunks, mcpServers, sources } from "@/lib/db/schema";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const src = await db.select().from(sources).where(eq(sources.notebookId, id));
  const ready = src.filter((s) => s.status === "ready");
  const mcp = await db.select({ kind: mcpServers.kind, enabled: mcpServers.enabled }).from(mcpServers).where(eq(mcpServers.notebookId, id));
  const chunkRows = await db.select().from(chunks).where(eq(chunks.notebookId, id));
  const suggestions: string[] = [];
  if (ready.length > 1) {
    suggestions.push("Where do these sources agree, and where do they conflict?");
    suggestions.push("Synthesize the core argument across every source, with citations.");
  }
  if (ready.some((s) => s.type === "youtube")) {
    suggestions.push("What should I learn first from the videos, and in what order?");
  }
  if (ready.some((s) => s.type === "pdf")) {
    suggestions.push("Extract the key claims, evidence, and limitations from the papers.");
  }
  if (ready.some((s) => s.type === "email")) {
    suggestions.push("What decisions, dates, and action items appear in these emails?");
  }
  if (ready.some((s) => s.type === "calendar")) {
    suggestions.push("What meetings and deadlines are coming up, and what are they about?");
  }
  if (ready.some((s) => s.type === "drive")) {
    suggestions.push("What do the Drive files say about this topic, with citations?");
  }
  if (ready.some((s) => s.type === "mcp")) {
    suggestions.push("What did the connected tools just pull in, and what should I look at next?");
  }
  if (mcp.some((s) => Boolean(s.enabled) && s.kind === "github")) {
    suggestions.push("What are the open issues and recent PRs I should know about?");
  }
  if (mcp.some((s) => Boolean(s.enabled) && s.kind === "jira")) {
    suggestions.push("Which Jira issues are in progress, and what's blocked?");
  }
  if (mcp.some((s) => Boolean(s.enabled) && s.kind === "postgres")) {
    suggestions.push("What tables exist, and what does the schema look like?");
  }
  const heading = chunkRows.find((c) => c.heading)?.heading;
  if (heading) suggestions.push(`Explain “${heading}” using the original wording.`);
  const first = chunkRows[0]?.content?.split(/[.?!]/)[0];
  if (first && first.length > 40 && first.length < 140) {
    suggestions.push(`What does this mean: “${first.trim()}”?`);
  }
  suggestions.push("Give me a briefing I could send to a teammate in five bullets.");
  const unique = [...new Set(suggestions)].slice(0, 6);
  return NextResponse.json({ suggestions: unique });
}

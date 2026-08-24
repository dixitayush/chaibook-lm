import { requireNotebook } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { mapArtifact } from "@/lib/db/map";
import { artifacts, chunks, sources } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { chatJson, hasLlmKey } from "@/lib/llm/client";
import { synthesizeSegment } from "@/lib/llm/tts";
import { clientIp, limitOrResponse } from "@/lib/rate-limit";
import type { ExplainerScene, PodcastSegment } from "@/lib/types";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const rows = await db.select().from(artifacts).where(eq(artifacts.notebookId, id));
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ artifacts: rows.map(mapArtifact) });
}

export async function POST(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const studioLimit = await limitOrResponse(`studio:${gate.user?.id || (await clientIp(req))}`, 12, 60);
  if (studioLimit) return studioLimit;
  if (!hasLlmKey()) {
    return NextResponse.json({ error: "Add an API key to generate studio artifacts." }, { status: 400 });
  }
  const nb = gate.notebook;
  const body = (await req.json()) as {
    kind?: "podcast" | "roadmap" | "guide" | "faq" | "cards" | "explainer";
    focus?: string;
  };
  const kind = body.kind || "guide";

  const src = await db.select().from(sources).where(eq(sources.notebookId, id));
  const ready = src.filter((s) => s.status === "ready");
  if (!ready.length) return NextResponse.json({ error: "Index at least one source first." }, { status: 400 });

  const chunkRows = await db.select().from(chunks).where(eq(chunks.notebookId, id));
  const corpus = chunkRows
    .slice(0, 40)
    .map((c, i) => `[${i + 1}] ${c.content.slice(0, 500)}`)
    .join("\n\n");
  const sourceList = ready.map((s) => `- ${s.title} (${s.type}${s.url ? ` · ${s.url}` : ""})`).join("\n");
  const focus = body.focus ? `\nUser focus: ${body.focus}` : "";

  let title = "";
  let payload: unknown = {};

  if (kind === "podcast") {
    const script = await chatJson<{
      title: string;
      segments: { speaker: "male" | "female"; text: string }[];
    }>(
      "You write a two-host podcast script. Hosts: Aarav (male, curious, precise) and Meera (female, warm, synthesizing). Ground every claim in the sources. 8-14 short turns. Conversational, not salesy.",
      `Notebook: ${nb.title}\nSources:\n${sourceList}\n\nExcerpts:\n${corpus}${focus}\n\nJSON shape: {"title": string, "segments": [{"speaker":"male"|"female","text": string}]}`,
    );
    const segments: PodcastSegment[] = [];
    for (const seg of script.segments.slice(0, 14)) {
      segments.push(await synthesizeSegment(seg.text, seg.speaker));
    }
    title = script.title || `Audio overview · ${nb.title}`;
    payload = { title, segments, tts: segments.some((s) => s.audioBase64) };
  } else if (kind === "roadmap") {
    const yt = ready.filter((s) => s.type === "youtube");
    if (!yt.length) {
      return NextResponse.json(
        { error: "Add YouTube videos or a playlist first to generate a learning roadmap." },
        { status: 400 },
      );
    }
    const data = await chatJson<{
      title: string;
      concept: string;
      nodes: {
        title: string;
        summary: string;
        level: "foundation" | "core" | "advanced";
        sourceTitle?: string;
        startTime?: number;
        why: string;
      }[];
    }>(
      "You design a personalized learning roadmap from the provided YouTube/transcript sources only. Pin concepts to specific videos and timestamps when present. Order from foundation → core → advanced. 5-9 nodes.",
      `Notebook: ${nb.title}\nSources:\n${sourceList}\n\nExcerpts (may include timestamps in metadata via surrounding text):\n${corpus}${focus}\n\nJSON: {"title":string,"concept":string,"nodes":[{"title":string,"summary":string,"level":"foundation"|"core"|"advanced","sourceTitle":string,"startTime":number,"why":string}]}`,
    );
    const nodes = (data.nodes || []).map((n, i) => {
      const match = yt.find((s) => n.sourceTitle && s.title.toLowerCase().includes(n.sourceTitle.toLowerCase().slice(0, 24))) || yt[Math.min(i, yt.length - 1)];
      let meta: { videoId?: string } = {};
      const rawMeta = match.metadata as unknown;
      if (rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)) {
        meta = rawMeta as { videoId?: string };
      } else if (typeof rawMeta === "string") {
        try {
          meta = JSON.parse(rawMeta || "{}") as { videoId?: string };
        } catch {
          meta = {};
        }
      }
      return {
        id: `node_${i}`,
        ...n,
        sourceId: match.id,
        sourceTitle: match.title,
        videoId: meta.videoId,
      };
    });
    title = data.title || `Roadmap · ${nb.title}`;
    payload = { title, concept: data.concept, nodes };
  } else if (kind === "faq") {
    const data = await chatJson<{ title: string; items: { q: string; a: string }[] }>(
      "Create an FAQ strictly from the sources. Each answer must mention which source it came from by title.",
      `Notebook: ${nb.title}\n${sourceList}\n\n${corpus}${focus}\nJSON: {"title":string,"items":[{"q":string,"a":string}]}`,
    );
    title = data.title || `FAQ · ${nb.title}`;
    payload = data;
  } else if (kind === "cards") {
    const data = await chatJson<{ title: string; cards: { q: string; a: string }[] }>(
      "Create 8-12 flashcards strictly from the sources. Questions should test recall. Answers short and cited by source title.",
      `Notebook: ${nb.title}\n${sourceList}\n\n${corpus}${focus}\nJSON: {"title":string,"cards":[{"q":string,"a":string}]}`,
    );
    title = data.title || `Flashcards · ${nb.title}`;
    payload = data;
  } else if (kind === "explainer") {
    const data = await chatJson<{
      title: string;
      thesis: string;
      scenes: {
        heading: string;
        narration: string;
        bullets: string[];
        visual: string;
        sourceTitle?: string;
        startTime?: number;
      }[];
    }>(
      "You write a Video Overview in Explainer format: a structured, comprehensive walkthrough that connects the dots within the sources. Do not list each source in isolation. Show how claims relate, reinforce, or contradict each other. 6-9 scenes. Each scene is one visual beat a host would narrate over a slide.",
      `Notebook: ${nb.title}\nSources:\n${sourceList}\n\nExcerpts:\n${corpus}${focus}\n\nJSON: {"title":string,"thesis":string,"scenes":[{"heading":string,"narration":string,"bullets":string[],"visual":string,"sourceTitle":string,"startTime":number}]}`,
    );
    const scenes: ExplainerScene[] = [];
    for (const scene of (data.scenes || []).slice(0, 9)) {
      const match =
        ready.find(
          (s) =>
            scene.sourceTitle &&
            s.title.toLowerCase().includes(scene.sourceTitle.toLowerCase().slice(0, 24)),
        ) || ready[Math.min(scenes.length, ready.length - 1)];
      const spoken = await synthesizeSegment(scene.narration, "female");
      scenes.push({
        heading: scene.heading,
        narration: scene.narration,
        bullets: scene.bullets || [],
        visual: scene.visual || scene.heading,
        sourceId: match?.id,
        sourceTitle: match?.title || scene.sourceTitle,
        startTime: scene.startTime,
        audioBase64: spoken.audioBase64,
        mimeType: spoken.mimeType,
      });
    }
    title = data.title || `Explainer · ${nb.title}`;
    payload = { title, thesis: data.thesis, scenes, tts: scenes.some((s) => s.audioBase64) };
  } else {
    const data = await chatJson<{
      title: string;
      overview: string;
      keyIdeas: string[];
      outline: { heading: string; bullets: string[] }[];
      openQuestions: string[];
    }>(
      "Write a briefing / study guide strictly from the sources. Be specific. No fluff.",
      `Notebook: ${nb.title}\n${sourceList}\n\n${corpus}${focus}\nJSON: {"title":string,"overview":string,"keyIdeas":string[],"outline":[{"heading":string,"bullets":string[]}],"openQuestions":string[]}`,
    );
    title = data.title || `Briefing · ${nb.title}`;
    payload = data;
  }

  const row = {
    id: createId("art"),
    notebookId: id,
    type: kind,
    title,
    payload,
    createdAt: Date.now(),
  };
  await db.insert(artifacts).values(row);
  return NextResponse.json({ artifact: mapArtifact(row) });
}

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chunks, sources } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { extractPdf } from "@/lib/ingest/pdf";
import { extractWebsite } from "@/lib/ingest/web";
import { extractYouTube } from "@/lib/ingest/youtube";
import { extractTranscript } from "@/lib/ingest/transcript";
import { formatEmailDocument, parseEmailInput } from "@/lib/ingest/email";
import { cleanMailBody, htmlToReadableText } from "@/lib/ingest/mail-clean";
import { formatCalendarDocument, parseCalendarInput } from "@/lib/ingest/calendar";
import { chunkText, estimateTokens, type RawChunk } from "@/lib/rag/chunk";
import { embedTexts } from "@/lib/rag/embed";
import { wordCount } from "@/lib/utils";
import type { SourceMeta, SourceType } from "@/lib/types";

async function setStatus(id: string, status: string, patch: Record<string, unknown> = {}) {
  await db
    .update(sources)
    .set({ status, updatedAt: Date.now(), ...patch })
    .where(eq(sources.id, id));
}

function parseMeta(raw: unknown): SourceMeta {
  if (raw && typeof raw === "object") return raw as SourceMeta;
  try {
    return JSON.parse(String(raw || "{}")) as SourceMeta;
  } catch {
    return {};
  }
}

export async function indexSource(sourceId: string) {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!source) return;

  try {
    await setStatus(sourceId, "extracting", { error: null });

    let title = source.title;
    let text = source.content ?? "";
    let extracted: RawChunk[] = [];
    const meta: SourceMeta = (typeof source.metadata === "object" && source.metadata
      ? source.metadata
      : {}) as SourceMeta;

    const type = source.type as SourceType;
    if (type === "pdf") {
      if (!source.fileData) throw new Error("PDF bytes missing.");
      const bytes = Buffer.from(source.fileData, "base64");
      const pdf = await extractPdf(new Uint8Array(bytes));
      extracted = pdf.chunks;
      text = pdf.text;
      meta.pages = pdf.pages;
    } else if (type === "website") {
      if (!source.url) throw new Error("Website URL missing.");
      const page = await extractWebsite(source.url);
      extracted = page.chunks;
      text = page.text;
      title = source.title === "Website" || !source.title ? page.title : source.title;
    } else if (type === "youtube") {
      if (!source.url) throw new Error("YouTube URL missing.");
      const yt = await extractYouTube(source.url);
      extracted = yt.chunks;
      text = yt.text;
      title = source.title === "YouTube video" || !source.title ? yt.title : source.title;
      meta.videoId = yt.videoId;
      meta.channel = yt.channel;
    } else if (type === "transcript") {
      const parsed = extractTranscript(text, meta.filename || title);
      extracted = parsed.chunks;
      text = parsed.text;
      if (!source.title || source.title === "Transcript") title = parsed.title;
    } else if (type === "email") {
      const parsed = parseEmailInput({
        raw: text,
        from: meta.from,
        to: meta.to,
        subject: meta.subject,
        date: meta.date,
      });
      const body = /<\/?[a-z][\s\S]*>/i.test(parsed.text)
        ? htmlToReadableText(parsed.text)
        : cleanMailBody(parsed.text);
      text = formatEmailDocument({ ...parsed, text: body });
      if (!text.trim()) throw new Error("Email is empty.");
      if (!source.title || source.title === "Email") {
        title = parsed.subject || parsed.from || "Email";
      }
      meta.from = parsed.from;
      meta.to = parsed.to;
      meta.subject = parsed.subject;
      meta.date = parsed.date;
      extracted = chunkText(text);
    } else if (type === "calendar") {
      if (/BEGIN:VEVENT/i.test(text) || !/^(Calendar:|Event:)/m.test(text)) {
        const events = parseCalendarInput(text);
        text = formatCalendarDocument(events, meta.calendarName || title);
        meta.eventCount = events.length;
      }
      if (!text.trim()) throw new Error("Calendar is empty.");
      if (!source.title || source.title === "Calendar") {
        title = meta.calendarName || "Calendar";
      }
      extracted = chunkText(text);
    } else if (type === "drive") {
      if (!text.trim()) throw new Error("Drive file is empty.");
      extracted = chunkText(text);
    } else {
      if (!text.trim()) throw new Error("Text source is empty.");
      extracted = chunkText(text);
    }

    if (!extracted.length) throw new Error("Nothing to index after extraction.");

    meta.wordCount = wordCount(text);
    meta.progress = 15;
    await setStatus(sourceId, "indexing", {
      title,
      content: text.slice(0, 400_000),
      metadata: meta as unknown as Record<string, unknown>,
    });

    await db.delete(chunks).where(eq(chunks.sourceId, sourceId));

    const vectors = await embedTexts(extracted.map((c) => c.content));
    const nowRows = extracted.map((c, i) => ({
      id: createId("chk"),
      sourceId,
      notebookId: source.notebookId,
      content: c.content,
      embedding: vectors[i] ?? [],
      chunkIndex: i,
      page: c.meta.page ?? null,
      startTime: c.meta.startTime != null ? Math.floor(c.meta.startTime) : null,
      endTime: c.meta.endTime != null ? Math.floor(c.meta.endTime) : null,
      heading: c.meta.heading ?? null,
      url: c.meta.url ?? source.url ?? null,
      tokenCount: estimateTokens(c.content),
    }));

    const insertBatch = 40;
    for (let i = 0; i < nowRows.length; i += insertBatch) {
      await db.insert(chunks).values(nowRows.slice(i, i + insertBatch));
      meta.progress = 15 + Math.round(((i + insertBatch) / nowRows.length) * 80);
      await db
        .update(sources)
        .set({ metadata: meta as unknown as Record<string, unknown>, updatedAt: Date.now() })
        .where(eq(sources.id, sourceId));
    }

    meta.progress = 100;
    await setStatus(sourceId, "ready", {
      title,
      chunkCount: nowRows.length,
      metadata: meta as unknown as Record<string, unknown>,
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Indexing failed.";
    await setStatus(sourceId, "error", { error: message });
  }
}

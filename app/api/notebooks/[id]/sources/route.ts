import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { mapSource } from "@/lib/db/map";
import { notebooks, sources } from "@/lib/db/schema";
import { extractPlaylist, parsePlaylistId, parseYouTubeId } from "@/lib/ingest/youtube";
import { formatEmailDocument, parseEmailInput } from "@/lib/ingest/email";
import { formatCalendarDocument, parseCalendarInput } from "@/lib/ingest/calendar";
import { enqueueSource } from "@/lib/ingest/create";
import { forgetAllSources } from "@/lib/memory/forget";
import { requireNotebook } from "@/lib/auth";
import { SOURCE_TYPES, type SourceType } from "@/lib/types";
import type { IdRoute } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 60;

function detectType(input: { type?: string; url?: string; filename?: string; text?: string }): SourceType {
  if (input.type && (SOURCE_TYPES as readonly string[]).includes(input.type)) {
    return input.type as SourceType;
  }
  const filename = (input.filename || "").toLowerCase();
  if (filename.endsWith(".pdf")) return "pdf";
  if (filename.endsWith(".eml") || filename.endsWith(".mbox")) return "email";
  if (filename.endsWith(".ics")) return "calendar";
  if (filename.endsWith(".vtt") || filename.endsWith(".srt")) return "transcript";
  const url = input.url || "";
  if (parseYouTubeId(url) || parsePlaylistId(url)) return "youtube";
  if (/^https?:\/\//i.test(url)) return "website";
  return "text";
}

export async function GET(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  const rows = await db.select().from(sources).where(eq(sources.notebookId, id));
  return NextResponse.json({ sources: rows.map(mapSource) });
}

export async function DELETE(_req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;
  await forgetAllSources(id);
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, ctx: IdRoute) {
  await ensureSchema();
  const { id } = await ctx.params;
  const gate = await requireNotebook(id);
  if (gate.response) return gate.response;

  const contentType = req.headers.get("content-type") || "";
  let type: SourceType;
  let title: string;
  let url: string | null = null;
  let text: string | null = null;
  let fileData: string | null = null;
  let filename: string | undefined;
  let metadata: Record<string, unknown> = {};
  let from = "";
  let to = "";
  let subject = "";
  let date = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    url = String(form.get("url") || "") || null;
    text = String(form.get("text") || "") || null;
    from = String(form.get("from") || "");
    to = String(form.get("to") || "");
    subject = String(form.get("subject") || "");
    date = String(form.get("date") || "");
    const explicit = String(form.get("type") || "") || undefined;
    filename = file instanceof File ? file.name : undefined;
    type = detectType({ type: explicit, url: url || undefined, filename, text: text || undefined });
    title = String(form.get("title") || "") || filename || (type === "pdf" ? "PDF" : "Source");
    if (file instanceof File) {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.byteLength > 12 * 1024 * 1024) {
        return NextResponse.json({ error: "File is larger than 12MB." }, { status: 413 });
      }
      if (type === "pdf") fileData = buf.toString("base64");
      else text = buf.toString("utf8");
      metadata.filename = file.name;
      metadata.mimeType = file.type;
    }
  } else {
    const body = (await req.json()) as {
      type?: string;
      title?: string;
      url?: string;
      text?: string;
      from?: string;
      to?: string;
      subject?: string;
      date?: string;
    };
    url = body.url || null;
    text = body.text || null;
    from = body.from || "";
    to = body.to || "";
    subject = body.subject || "";
    date = body.date || "";
    type = detectType(body);
    title =
      body.title ||
      (type === "youtube"
        ? "YouTube video"
        : type === "website"
          ? "Website"
          : type === "email"
            ? subject || "Email"
            : type === "calendar"
              ? "Calendar"
              : type === "drive"
                ? "Drive file"
                : "Note");
  }

  if (type === "email") {
    const parsed = parseEmailInput({ raw: text || "", from, to, subject, date });
    text = formatEmailDocument(parsed);
    if (!title || title === "Source" || title === "Email") title = parsed.subject || parsed.from || "Email";
    metadata = {
      ...metadata,
      from: parsed.from,
      to: parsed.to,
      subject: parsed.subject,
      date: parsed.date,
    };
  }

  if (type === "calendar") {
    const events = parseCalendarInput(text || "");
    text = formatCalendarDocument(events, title || "Calendar");
    if (!title || title === "Source" || title === "Calendar") {
      title = events[0]?.title || filename || "Calendar";
    }
    metadata = { ...metadata, eventCount: events.length, calendarName: title };
  }

  if (type === "youtube" && url) {
    const playlistId = parsePlaylistId(url);
    const videoId = parseYouTubeId(url);
    if (playlistId && !videoId) {
      const videos = await extractPlaylist(playlistId);
      const created = [];
      for (const video of videos) {
        created.push(
          await enqueueSource({
            notebookId: id,
            type: "youtube",
            title: video.title,
            url: video.url,
            metadata: { videoId: video.videoId, playlistId },
            userId: gate.user?.id,
            authorName: gate.user?.name,
          }),
        );
      }
      await db.update(notebooks).set({ updatedAt: Date.now() }).where(eq(notebooks.id, id));
      return NextResponse.json({ sources: created.map(mapSource), playlist: true });
    }
  }

  if (type === "website" && !url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
  if (type === "youtube" && !url) return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
  if (type === "text" && !text) return NextResponse.json({ error: "Text is required" }, { status: 400 });
  if (type === "pdf" && !fileData) return NextResponse.json({ error: "PDF file is required" }, { status: 400 });
  if (type === "transcript" && !text) return NextResponse.json({ error: "Transcript file is required" }, { status: 400 });
  if (type === "email" && !text) return NextResponse.json({ error: "Paste an email, or upload a .eml file." }, { status: 400 });
  if (type === "calendar" && !text) return NextResponse.json({ error: "Paste events, or upload an .ics calendar." }, { status: 400 });
  if (type === "drive" && !text && !fileData) {
    return NextResponse.json({ error: "Choose Drive files after connecting Google." }, { status: 400 });
  }

  const row = await enqueueSource({
    notebookId: id,
    type,
    title,
    url,
    content: text,
    fileData,
    metadata,
    userId: gate.user?.id,
    authorName: gate.user?.name,
  });
  await db.update(notebooks).set({ updatedAt: Date.now() }).where(eq(notebooks.id, id));
  return NextResponse.json({ source: mapSource(row), sources: [mapSource(row)] });
}

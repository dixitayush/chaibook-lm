import { chunkTimed, type RawChunk } from "@/lib/rag/chunk";
import { youtubeEmbedUrl, youtubeWatchUrl } from "@/lib/youtube-urls";

export { youtubeEmbedUrl, youtubeWatchUrl };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function parseYouTubeId(input: string) {
  try {
    const u = new URL(input);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0];
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const shorts = u.pathname.match(/\/(shorts|embed|live)\/([^/?]+)/);
    if (shorts) return shorts[2];
  } catch {
    if (/^[\w-]{11}$/.test(input)) return input;
  }
  return null;
}

export function parsePlaylistId(input: string) {
  try {
    const u = new URL(input);
    return u.searchParams.get("list");
  } catch {
    return null;
  }
}

type Cue = { text: string; start: number; end: number };
type CaptionTrack = {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
  vssId?: string;
  ua?: string;
};

const INNERTUBE_CLIENTS = [
  {
    name: "ANDROID",
    ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
    clientId: "3",
    client: {
      clientName: "ANDROID",
      clientVersion: "20.10.38",
      androidSdkVersion: 34,
      hl: "en",
      gl: "US",
    },
  },
  {
    name: "IOS",
    ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_2_0 like Mac OS X;)",
    clientId: "5",
    client: {
      clientName: "IOS",
      clientVersion: "20.10.4",
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      osName: "iPhone",
      osVersion: "18.2.0.22C152",
      hl: "en",
      gl: "US",
    },
  },
] as const;

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJson3(raw: string): Cue[] {
  try {
    const data = JSON.parse(raw) as {
      events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[];
    };
    const cues: Cue[] = [];
    for (const ev of data.events ?? []) {
      const text = (ev.segs ?? [])
        .map((s) => s.utf8 ?? "")
        .join("")
        .replace(/\n+/g, " ")
        .trim();
      if (!text || text === "♪") continue;
      const start = (ev.tStartMs ?? 0) / 1000;
      const dur = (ev.dDurationMs ?? 2000) / 1000;
      cues.push({ text, start, end: start + dur });
    }
    return cues;
  } catch {
    return [];
  }
}

function parseSrvXml(xml: string): Cue[] {
  const cues: Cue[] = [];
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(xml))) {
    const attrs = m[1];
    const t = Number(/[tT]="([^"]+)"/.exec(attrs)?.[1] ?? /(?:^|\s)t="([^"]+)"/.exec(attrs)?.[1] ?? NaN);
    const d = Number(/[dD]="([^"]+)"/.exec(attrs)?.[1] ?? NaN);
    const text = decodeEntities(m[2]);
    if (!text || Number.isNaN(t)) continue;
    const start = t / 1000;
    const dur = Number.isNaN(d) ? 2 : d / 1000;
    cues.push({ text, start, end: start + (dur || 2) });
  }
  return cues;
}

function parseTextXml(xml: string): Cue[] {
  const cues: Cue[] = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const start = Number(/start="([^"]+)"/.exec(attrs)?.[1] ?? NaN);
    const dur = Number(/dur="([^"]+)"/.exec(attrs)?.[1] ?? 0);
    const text = decodeEntities(m[2]);
    if (!text || Number.isNaN(start)) continue;
    cues.push({ text, start, end: start + (dur || 2) });
  }
  return cues;
}

function parseVtt(raw: string): Cue[] {
  if (!/WEBVTT/i.test(raw) && !raw.includes("-->")) return [];
  const cues: Cue[] = [];
  const blocks = raw.replace(/\r/g, "").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l && !/^WEBVTT/i.test(l) && !/^\d+$/.test(l));
    const time = lines.find((l) => l.includes("-->"));
    if (!time) continue;
    const [a, b] = time.split("-->").map((s) => s.trim().split(" ")[0]);
    const text = decodeEntities(lines.filter((l) => l !== time).join(" "));
    if (!text) continue;
    cues.push({ text, start: parseTs(a), end: parseTs(b) });
  }
  return cues;
}

function parseTs(raw: string) {
  const parts = raw.replace(",", ".").split(":");
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  return Number(raw) || 0;
}

function parseCaptions(body: string): Cue[] {
  const trimmed = body.trim();
  if (!trimmed || trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) return [];
  if (trimmed.startsWith("{")) return parseJson3(trimmed);
  for (const parse of [parseSrvXml, parseTextXml, parseVtt]) {
    const cues = parse(trimmed);
    if (cues.length) return cues;
  }
  return [];
}

function pickTrack(tracks: CaptionTrack[]) {
  const score = (t: CaptionTrack) => {
    const lang = (t.languageCode || t.vssId || "").toLowerCase();
    let n = 0;
    if (lang.startsWith("en") || lang.includes(".en")) n += 3;
    if (t.kind !== "asr") n += 1;
    return n;
  };
  return [...tracks].sort((a, b) => score(b) - score(a))[0];
}

async function fetchCaptionBody(baseUrl: string, fmt: "json3" | "srv3" | "vtt" | "srv1", ua: string) {
  const url = new URL(baseUrl);
  url.searchParams.delete("fmt");
  url.searchParams.set("fmt", fmt);
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!res.ok) return "";
  return res.text();
}

async function cuesFromTrack(track: CaptionTrack): Promise<Cue[]> {
  const ua = track.ua || UA;
  for (const fmt of ["json3", "srv3", "vtt", "srv1"] as const) {
    const body = await fetchCaptionBody(track.baseUrl, fmt, ua);
    const cues = parseCaptions(body);
    if (cues.length) return cues;
  }
  const raw = await fetch(track.baseUrl, { headers: { "User-Agent": ua } }).then((r) => r.text());
  return parseCaptions(raw);
}

function tracksFromPlayer(player: unknown, ua?: string): CaptionTrack[] {
  const captions = (player as {
    captions?: {
      playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
    };
  })?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return (captions ?? []).map((t) => ({ ...t, ua }));
}

async function innertubeApiKey(videoId: string) {
  try {
    const watch = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!watch.ok) return null;
    const html = await watch.text();
    return html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function playerViaInnertube(
  videoId: string,
  spec: (typeof INNERTUBE_CLIENTS)[number],
  apiKey?: string | null,
) {
  const endpoint = apiKey
    ? `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}&prettyPrint=false`
    : "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": spec.ua,
      "X-YouTube-Client-Name": spec.clientId,
      "X-YouTube-Client-Version": spec.client.clientVersion,
    },
    body: JSON.stringify({
      context: { client: spec.client },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<unknown>;
}

async function fetchTranscript(videoId: string): Promise<Cue[]> {
  const apiKey = await innertubeApiKey(videoId);
  const collected: CaptionTrack[] = [];

  for (const spec of INNERTUBE_CLIENTS) {
    try {
      const player = await playerViaInnertube(videoId, spec, apiKey);
      const tracks = tracksFromPlayer(player, spec.ua);
      collected.push(...tracks);
      const cues = await cuesFromTracks(tracks);
      if (cues.length) return cues;
    } catch {
      /* try next client */
    }
  }

  const cues = await cuesFromTracks(collected);
  if (cues.length) return cues;

  if (!collected.length) {
    throw new Error("This video has no captions. Auto-captions must be on, or upload a .vtt transcript instead.");
  }
  throw new Error(
    "YouTube returned a caption track but the text was empty. Try another video, or upload a .vtt / .srt file.",
  );
}

async function cuesFromTracks(tracks: CaptionTrack[]): Promise<Cue[]> {
  const seen = new Set<string>();
  const unique = tracks.filter((t) => {
    if (!t.baseUrl || seen.has(t.baseUrl)) return false;
    seen.add(t.baseUrl);
    return true;
  });
  const ordered = [pickTrack(unique), ...unique].filter(Boolean) as CaptionTrack[];
  const tried = new Set<string>();
  for (const track of ordered) {
    if (tried.has(track.baseUrl)) continue;
    tried.add(track.baseUrl);
    const cues = await cuesFromTrack(track);
    if (cues.length) return cues;
  }
  return [];
}

export async function oembedYouTube(url: string) {
  const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
  if (!res.ok) return { title: "YouTube video", author: "" };
  const data = (await res.json()) as { title?: string; author_name?: string };
  return { title: data.title || "YouTube video", author: data.author_name || "" };
}

export async function extractYouTube(url: string): Promise<{
  videoId: string;
  title: string;
  channel: string;
  text: string;
  chunks: RawChunk[];
}> {
  const videoId = parseYouTubeId(url);
  if (!videoId) throw new Error("Not a valid YouTube video URL.");
  const [cues, meta] = await Promise.all([
    fetchTranscript(videoId),
    oembedYouTube(`https://www.youtube.com/watch?v=${videoId}`),
  ]);
  const chunks = chunkTimed(cues).map((c) => ({
    ...c,
    meta: { ...c.meta, videoId, url: `https://www.youtube.com/watch?v=${videoId}` },
  }));
  const text = cues.map((c) => c.text).join(" ");
  if (!chunks.length && text.trim()) {
    return {
      videoId,
      title: meta.title,
      channel: meta.author,
      text,
      chunks: [{ content: text.slice(0, 8000), meta: { videoId, url: `https://www.youtube.com/watch?v=${videoId}` } }],
    };
  }
  return { videoId, title: meta.title, channel: meta.author, text, chunks };
}

export type PlaylistVideo = { videoId: string; title: string; url: string };

export async function extractPlaylist(playlistId: string): Promise<PlaylistVideo[]> {
  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`,
    { headers: { "User-Agent": UA } },
  );
  if (!res.ok) throw new Error("Could not load this playlist. Make sure it is public.");
  const xml = await res.text();
  const entries: PlaylistVideo[] = [];
  const re = /<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]+)<\/title>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const videoId = m[1];
    entries.push({
      videoId,
      title: decodeEntities(m[2]),
      url: `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`,
    });
  }
  if (!entries.length) throw new Error("Playlist is empty or unavailable.");
  return entries.slice(0, 12);
}

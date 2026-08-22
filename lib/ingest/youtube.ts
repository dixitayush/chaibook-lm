import { chunkTimed, type RawChunk } from "@/lib/rag/chunk";
import { youtubeEmbedUrl, youtubeWatchUrl } from "@/lib/youtube-urls";

export { youtubeEmbedUrl, youtubeWatchUrl };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Skip the EU consent interstitial that datacenter IPs often get instead of a player. */
const YT_COOKIE = "CONSENT=YES+cb.20210328-17-p0.en+FX+123; SOCS=CAI";

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
    name: "WEB",
    ua: UA,
    clientId: "1",
    client: {
      clientName: "WEB",
      clientVersion: "2.20250822.01.00",
      hl: "en",
      gl: "US",
    },
  },
  {
    name: "MWEB",
    ua: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    clientId: "2",
    client: {
      clientName: "MWEB",
      clientVersion: "2.20250822.01.00",
      hl: "en",
      gl: "US",
    },
  },
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
  {
    name: "TVHTML5",
    ua: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version",
    clientId: "7",
    client: {
      clientName: "TVHTML5",
      clientVersion: "7.20250822.10.00",
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

function innertubeHeaders(spec: (typeof INNERTUBE_CLIENTS)[number], videoId?: string) {
  return {
    "Content-Type": "application/json",
    "User-Agent": spec.ua,
    "X-YouTube-Client-Name": spec.clientId,
    "X-YouTube-Client-Version": spec.client.clientVersion,
    Cookie: YT_COOKIE,
    Origin: "https://www.youtube.com",
    Referer: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "https://www.youtube.com/",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

function walkJson(value: unknown, visit: (node: Record<string, unknown>) => void, depth = 0) {
  if (!value || typeof value !== "object" || depth > 40) return;
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visit, depth + 1);
    return;
  }
  const node = value as Record<string, unknown>;
  visit(node);
  for (const child of Object.values(node)) walkJson(child, visit, depth + 1);
}

function transcriptParamsFrom(data: unknown): string[] {
  const params: string[] = [];
  const seen = new Set<string>();
  walkJson(data, (node) => {
    const endpoint = node.getTranscriptEndpoint as { params?: string } | undefined;
    const p = endpoint?.params;
    if (p && !seen.has(p)) {
      seen.add(p);
      params.push(p);
    }
  });
  return params;
}

function cuesFromTranscriptJson(data: unknown): Cue[] {
  const cues: Cue[] = [];
  walkJson(data, (node) => {
    const seg = node.transcriptSegmentRenderer as
      | {
          startMs?: string;
          endMs?: string;
          snippet?: { runs?: { text?: string }[] };
        }
      | undefined;
    if (!seg) return;
    const text = (seg.snippet?.runs ?? [])
      .map((r) => r.text ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return;
    const start = Number(seg.startMs ?? 0) / 1000;
    const end = Number(seg.endMs ?? Number(seg.startMs ?? 0) + 2000) / 1000;
    cues.push({ text, start, end: end > start ? end : start + 2 });
  });
  return cues;
}

async function innertubePost(path: string, spec: (typeof INNERTUBE_CLIENTS)[number], body: unknown, apiKey?: string | null) {
  const url = apiKey
    ? `https://www.youtube.com/youtubei/v1/${path}?key=${encodeURIComponent(apiKey)}&prettyPrint=false`
    : `https://www.youtube.com/youtubei/v1/${path}?prettyPrint=false`;
  const videoId = typeof body === "object" && body && "videoId" in body ? String((body as { videoId?: string }).videoId ?? "") : "";
  const res = await fetch(url, {
    method: "POST",
    headers: innertubeHeaders(spec, videoId),
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json() as Promise<unknown>;
}

async function cuesViaGetTranscript(videoId: string, apiKey?: string | null, initial?: unknown): Promise<Cue[]> {
  const clients = INNERTUBE_CLIENTS.filter((c) => c.name === "WEB" || c.name === "ANDROID" || c.name === "MWEB");
  const paramSets = [...transcriptParamsFrom(initial)];
  for (const spec of clients) {
    if (paramSets.length) break;
    const next = await innertubePost(
      "next",
      spec,
      { context: { client: spec.client }, videoId },
      apiKey,
    );
    paramSets.push(...transcriptParamsFrom(next));
  }
  for (const spec of clients) {
    for (const params of paramSets) {
      const data = await innertubePost(
        "get_transcript",
        spec,
        { context: { client: spec.client }, params, videoId },
        apiKey,
      );
      const cues = cuesFromTranscriptJson(data);
      if (cues.length) return cues;
    }
  }
  return [];
}

async function fetchCaptionBody(baseUrl: string, fmt: "json3" | "srv3" | "vtt" | "srv1", ua: string) {
  const url = new URL(baseUrl);
  url.searchParams.delete("fmt");
  url.searchParams.set("fmt", fmt);
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": ua,
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: YT_COOKIE,
      Origin: "https://www.youtube.com",
      Referer: "https://www.youtube.com/",
    },
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
  const raw = await fetch(track.baseUrl, {
    headers: { "User-Agent": ua, Cookie: YT_COOKIE },
  }).then((r) => r.text());
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

function extractAssignedJson(html: string, name: string) {
  const needle = `${name} = `;
  const at = html.indexOf(needle);
  if (at < 0) return null;
  let i = html.indexOf("{", at + needle.length);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(i, j + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function playerFromWatchHtml(html: string) {
  return extractAssignedJson(html, "ytInitialPlayerResponse");
}

function watchLooksBlocked(html: string) {
  return (
    /consent\.youtube|Before you continue to YouTube|captcha|unusual traffic|Sign in to confirm/i.test(html) &&
    !/ytInitialPlayerResponse/.test(html)
  );
}

async function fetchWatchPage(videoId: string) {
  const watch = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en&persist_hl=1`, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: YT_COOKIE,
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!watch.ok) return { html: "", apiKey: null as string | null, blocked: true };
  const html = await watch.text();
  return {
    html,
    apiKey: html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ?? null,
    blocked: watchLooksBlocked(html),
  };
}

async function playerViaInnertube(
  videoId: string,
  spec: (typeof INNERTUBE_CLIENTS)[number],
  apiKey?: string | null,
) {
  return innertubePost(
    "player",
    spec,
    {
      context: { client: spec.client },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    },
    apiKey,
  );
}

function tracksFromTimedtextList(xml: string, videoId: string): CaptionTrack[] {
  const tracks: CaptionTrack[] = [];
  const re = /<track\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const lang = /lang_code="([^"]+)"/.exec(attrs)?.[1];
    if (!lang) continue;
    const kind = /kind="([^"]+)"/.exec(attrs)?.[1];
    const name = /name="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const url = new URL("https://www.youtube.com/api/timedtext");
    url.searchParams.set("v", videoId);
    url.searchParams.set("lang", lang);
    if (kind) url.searchParams.set("kind", kind);
    if (name) url.searchParams.set("name", name);
    tracks.push({
      baseUrl: url.toString(),
      languageCode: lang,
      kind,
      vssId: kind === "asr" ? `a.${lang}` : `.${lang}`,
      ua: UA,
    });
  }
  return tracks;
}

async function tracksViaTimedtext(videoId: string): Promise<CaptionTrack[]> {
  try {
    const list = await fetch(`https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: YT_COOKIE },
    });
    if (!list.ok) return [];
    return tracksFromTimedtextList(await list.text(), videoId);
  } catch {
    return [];
  }
}

async function fetchTranscript(videoId: string): Promise<Cue[]> {
  const collected: CaptionTrack[] = [];
  let blocked = false;
  let initialData: unknown;

  try {
    const watch = await fetchWatchPage(videoId);
    blocked = watch.blocked;
    initialData = extractAssignedJson(watch.html, "ytInitialData");
    const player = playerFromWatchHtml(watch.html);

    const panelCues = await cuesViaGetTranscript(videoId, watch.apiKey, initialData);
    if (panelCues.length) return panelCues;

    const fromHtml = tracksFromPlayer(player, UA);
    collected.push(...fromHtml);
    const htmlCues = await cuesFromTracks(fromHtml);
    if (htmlCues.length) return htmlCues;

    for (const spec of INNERTUBE_CLIENTS) {
      try {
        const remote = await playerViaInnertube(videoId, spec, watch.apiKey);
        const tracks = tracksFromPlayer(remote, spec.ua);
        collected.push(...tracks);
        const cues = await cuesFromTracks(tracks);
        if (cues.length) return cues;
      } catch {
        /* try next client */
      }
    }
  } catch {
    /* keep going */
  }

  const innertubeCues = await cuesViaGetTranscript(videoId, null, initialData);
  if (innertubeCues.length) return innertubeCues;

  const timed = await tracksViaTimedtext(videoId);
  collected.push(...timed);
  const timedCues = await cuesFromTracks(timed);
  if (timedCues.length) return timedCues;

  const leftover = await cuesFromTracks(collected);
  if (leftover.length) return leftover;

  if (blocked) {
    throw new Error(
      "YouTube blocked caption fetch from this server (datacenter IP). Upload a .vtt / .srt transcript, or try again later.",
    );
  }
  if (!collected.length) {
    throw new Error("This video has no captions. Auto-captions must be on, or upload a .vtt transcript instead.");
  }
  throw new Error(
    "YouTube listed captions but blocked the text from this server. Upload a .vtt / .srt file, or try a video with official (not auto) captions.",
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
  const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
    headers: { "User-Agent": UA, Cookie: YT_COOKIE },
  });
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
    { headers: { "User-Agent": UA, Cookie: YT_COOKIE } },
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

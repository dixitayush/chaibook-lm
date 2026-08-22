import type { ChunkMeta } from "@/lib/types";

export type RawChunk = {
  content: string;
  meta: ChunkMeta;
};

const DEFAULT_SIZE = 900;
const DEFAULT_OVERLAP = 160;
const SEPARATORS = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "];

function splitBy(text: string, sep: string) {
  if (!sep) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length) {
    const i = remaining.indexOf(sep);
    if (i < 0) {
      parts.push(remaining);
      break;
    }
    parts.push(remaining.slice(0, i + sep.length));
    remaining = remaining.slice(i + sep.length);
  }
  return parts.filter(Boolean);
}

function pack(parts: string[], size: number, overlap: number) {
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts) {
    if (part.length > size) {
      if (buf.trim()) {
        chunks.push(buf.trim());
        buf = "";
      }
      for (let i = 0; i < part.length; i += size - overlap) {
        chunks.push(part.slice(i, i + size).trim());
      }
      continue;
    }
    if ((buf + part).length > size) {
      chunks.push(buf.trim());
      const tail = buf.slice(-overlap);
      buf = tail + part;
    } else {
      buf += part;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter((c) => c.length > 24);
}

function recursiveSplit(text: string, size: number, overlap: number, seps = SEPARATORS): string[] {
  if (text.length <= size) return [text.trim()].filter(Boolean);
  const sep = seps.find((s) => text.includes(s));
  if (!sep) {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += size - overlap) {
      out.push(text.slice(i, i + size).trim());
    }
    return out.filter(Boolean);
  }
  const parts = splitBy(text, sep);
  const packed = pack(parts, size, overlap);
  if (packed.every((p) => p.length <= size * 1.15)) return packed;
  return packed.flatMap((p) => recursiveSplit(p, size, overlap, seps.slice(1)));
}

export function chunkText(text: string, meta: ChunkMeta = {}, size = DEFAULT_SIZE, overlap = DEFAULT_OVERLAP): RawChunk[] {
  const cleaned = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return recursiveSplit(cleaned, size, overlap).map((content) => ({ content, meta: { ...meta } }));
}

export function chunkPages(pages: { page: number; text: string }[], size = DEFAULT_SIZE) {
  return pages.flatMap(({ page, text }) => chunkText(text, { page }, size));
}

export function chunkTimed(cues: { text: string; start: number; end: number }[], windowSec = 45) {
  const groups: RawChunk[] = [];
  let buf: string[] = [];
  let start = 0;
  let end = 0;
  const flush = () => {
    if (!buf.length) return;
    groups.push({
      content: buf.join(" ").replace(/\s+/g, " ").trim(),
      meta: { startTime: start, endTime: end },
    });
    buf = [];
  };
  for (const cue of cues) {
    if (!buf.length) start = cue.start;
    if (cue.end - start >= windowSec && buf.length) {
      flush();
      start = cue.start;
    }
    buf.push(cue.text);
    end = cue.end;
  }
  flush();
  return groups.filter((g) => g.content.length > 20);
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

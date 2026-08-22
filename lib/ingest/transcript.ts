import { chunkTimed, chunkText, type RawChunk } from "@/lib/rag/chunk";

type Cue = { text: string; start: number; end: number };

function parseTimestamp(raw: string) {
  const parts = raw.trim().replace(",", ".").split(":");
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  }
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  return Number(raw) || 0;
}

export function extractTranscript(raw: string, filename = "transcript"): {
  title: string;
  text: string;
  chunks: RawChunk[];
} {
  const text = raw.replace(/^\uFEFF/, "").trim();
  const cues = text.includes("-->") ? parseCues(text) : null;
  if (cues?.length) {
    const chunks = chunkTimed(cues);
    return {
      title: filename.replace(/\.(vtt|srt|txt)$/i, ""),
      text: cues.map((c) => c.text).join(" "),
      chunks,
    };
  }
  return {
    title: filename.replace(/\.(vtt|srt|txt)$/i, ""),
    text,
    chunks: chunkText(text),
  };
}

function parseCues(raw: string): Cue[] {
  const blocks = raw.replace(/\r/g, "").split(/\n\n+/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l && !/^WEBVTT/i.test(l) && !/^NOTE\b/.test(l) && !/^\d+$/.test(l));
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split("-->").map((s) => s.trim().split(" ")[0]);
    const body = lines.filter((l) => l !== timeLine).join(" ").replace(/<[^>]+>/g, "").trim();
    if (!body) continue;
    cues.push({ text: body, start: parseTimestamp(startRaw), end: parseTimestamp(endRaw) });
  }
  return cues;
}

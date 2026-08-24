import { hydrateLlmEnv } from "@/lib/env";

type Cue = { text: string; start: number; end: number };

const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash"];

function geminiKey() {
  hydrateLlmEnv();
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)?.trim() || "";
}

function parseCues(raw: string): Cue[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const data = JSON.parse(cleaned) as { cues?: { text?: string; start?: number; end?: number }[] };
    const cues = (data.cues ?? [])
      .map((c) => {
        const text = (c.text ?? "").replace(/\s+/g, " ").trim();
        const start = Number(c.start ?? 0);
        const end = Number(c.end ?? start + 4);
        if (!text) return null;
        return { text, start: Number.isFinite(start) ? start : 0, end: end > start ? end : start + 4 };
      })
      .filter((c): c is Cue => Boolean(c));
    if (cues.length) return cues;
  } catch {
    /* fall through to prose */
  }
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 12);
  if (sentences.length < 3) return [];
  let t = 0;
  return sentences.map((s) => {
    const cue = { text: s.trim(), start: t, end: t + 6 };
    t += 6;
    return cue;
  });
}

async function generate(model: string, key: string, videoId: string): Promise<{ text: string; status: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Transcribe the spoken content of this YouTube video. Group into segments of about 12-25 words. Cover the whole video. Skip music-only parts.
Return ONLY JSON: {"cues":[{"text":string,"start":number,"end":number}]}
start and end are seconds from the beginning. If there is no speech, return {"cues":[]}.`,
            },
            { file_data: { file_uri: watch, mime_type: "video/mp4" } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) return { text: "", status: res.status };
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return {
    text: body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
    status: res.status,
  };
}

/** Gemini can read a public YouTube URL when timedtext captions are missing or blocked. */
export async function transcribeYouTubeWithGemini(videoId: string): Promise<Cue[]> {
  const key = geminiKey();
  if (!key) return [];
  for (const model of MODELS) {
    try {
      const { text, status } = await generate(model, key, videoId);
      const cues = parseCues(text);
      if (cues.length) return cues;
      if (status === 200) return [];
      if (status !== 404) continue;
    } catch {
      continue;
    }
  }
  return [];
}

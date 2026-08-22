import { getLlm } from "@/lib/llm/client";
import type { PodcastSegment } from "@/lib/types";

export async function synthesizeSegment(text: string, voice: "male" | "female"): Promise<PodcastSegment> {
  const llm = getLlm();
  const name = voice === "male" ? "Aarav" : "Meera";
  if (!llm.tts) {
    return { speaker: voice, name, text };
  }
  const chosen =
    voice === "male"
      ? process.env.PODCAST_VOICE_MALE || "onyx"
      : process.env.PODCAST_VOICE_FEMALE || "nova";
  const speech = await llm.client.audio.speech.create({
    model: "tts-1",
    voice: chosen as "onyx" | "nova" | "alloy" | "echo" | "fable" | "shimmer",
    input: text.slice(0, 4000),
    response_format: "mp3",
  });
  const buf = Buffer.from(await speech.arrayBuffer());
  return {
    speaker: voice,
    name,
    text,
    audioBase64: buf.toString("base64"),
    mimeType: "audio/mpeg",
  };
}

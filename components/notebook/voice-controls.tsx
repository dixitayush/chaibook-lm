"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2Icon, MicIcon, PauseIcon, Volume2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => SpeechRec) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const STOP_SPEAK = "chaibook-stop-speak";

export function useVoiceInput(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const finalRef = useRef("");

  function stop() {
    recRef.current?.abort();
    recRef.current = null;
    setListening(false);
  }

  useEffect(() => {
    return () => recRef.current?.abort();
  }, []);

  function toggle() {
    if (listening) {
      stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) {
      toast.error("Voice input needs Chrome, Edge, or Safari.");
      return;
    }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    finalRef.current = "";
    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const piece = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalRef.current = `${finalRef.current} ${piece}`.trim();
        else interim = piece;
      }
      onText([finalRef.current, interim].filter(Boolean).join(" ").trim());
    };
    rec.onerror = (ev) => {
      if (ev.error !== "no-speech" && ev.error !== "aborted") {
        toast.error(ev.error === "not-allowed" ? "Microphone permission was denied." : "Voice input failed.");
      }
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      toast.error("Could not start the microphone.");
    }
  }

  return { listening, toggle, stop };
}

const spokenCache = new Map<string, { script: string; audioBase64: string | null; mimeType: string }>();

export function SpeakButton({
  notebookId,
  messageId,
  text,
  question,
  disabled,
}: {
  notebookId: string;
  messageId: string;
  text: string;
  question?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const genRef = useRef(0);

  function stop() {
    genRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    if (utterRef.current) {
      window.speechSynthesis?.cancel();
      utterRef.current = null;
    }
    setPlaying(false);
    setBusy(false);
  }

  useEffect(() => {
    const onOther = () => stop();
    window.addEventListener(STOP_SPEAK, onOther);
    return () => {
      window.removeEventListener(STOP_SPEAK, onOther);
      stop();
    };
  }, []);

  function playBrowser(script: string) {
    window.speechSynthesis?.cancel();
    const u = new SpeechSynthesisUtterance(script);
    const voices = window.speechSynthesis?.getVoices() ?? [];
    u.voice = voices.find((v) => /female|samantha|victoria|zira|google us/i.test(v.name)) || voices[0] || null;
    u.rate = 1.02;
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    utterRef.current = u;
    window.speechSynthesis.speak(u);
    setPlaying(true);
  }

  function playFile(b64: string, mime: string) {
    const src = `data:${mime};base64,${b64}`;
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => {
      setPlaying(false);
      toast.error("Could not play audio.");
    };
    void audio.play();
    setPlaying(true);
  }

  async function speak() {
    if (playing) {
      stop();
      return;
    }
    window.dispatchEvent(new Event(STOP_SPEAK));
    const gen = ++genRef.current;
    const cached = spokenCache.get(messageId);
    if (cached) {
      if (cached.audioBase64) playFile(cached.audioBase64, cached.mimeType);
      else playBrowser(cached.script);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, question }),
      });
      const data = (await res.json()) as {
        script?: string;
        audioBase64?: string | null;
        mimeType?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not speak");
      if (gen !== genRef.current) return;
      const script = data.script || text;
      spokenCache.set(messageId, {
        script,
        audioBase64: data.audioBase64 ?? null,
        mimeType: data.mimeType || "audio/mpeg",
      });
      if (data.audioBase64) playFile(data.audioBase64, data.mimeType || "audio/mpeg");
      else playBrowser(script);
    } catch (err) {
      if (gen !== genRef.current) return;
      toast.error(err instanceof Error ? err.message : "Could not speak this answer");
    } finally {
      if (gen === genRef.current) setBusy(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={playing ? "Stop speaking" : "Listen to a spoken summary"}
            disabled={disabled || busy}
            onClick={() => void speak()}
            className={cn(playing && "text-chai")}
          />
        }
      >
        {busy ? <Loader2Icon className="animate-spin" /> : playing ? <PauseIcon /> : <Volume2Icon />}
      </TooltipTrigger>
      <TooltipContent>{busy ? "Writing a spoken summary…" : playing ? "Stop" : "Listen (spoken summary)"}</TooltipContent>
    </Tooltip>
  );
}

export function MicButton({
  listening,
  onToggle,
  disabled,
}: {
  listening: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={listening ? "default" : "ghost"}
            size="icon"
            aria-label={listening ? "Stop listening" : "Ask with voice"}
            disabled={disabled}
            onClick={onToggle}
            className={cn(listening && "animate-pulse")}
          />
        }
      >
        <MicIcon />
      </TooltipTrigger>
      <TooltipContent>{listening ? "Stop listening" : "Ask with voice"}</TooltipContent>
    </Tooltip>
  );
}

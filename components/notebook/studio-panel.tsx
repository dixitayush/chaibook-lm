"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PauseIcon, PlayIcon, BrainIcon, PlugIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ExplainerPayload, ExplainerScene, PodcastSegment, RoadmapNode, StudioArtifact } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MemoryPanel } from "./memory-panel";
import { McpPanel } from "./mcp-panel";
import { StudioCards, type StudioKind } from "./studio-cards";

export function StudioPanel({
  notebookId,
  hasYoutube,
  refreshToken,
  isOwner = true,
  onOpenSource,
  onToolsChange,
}: {
  notebookId: string;
  hasYoutube: boolean;
  refreshToken?: number;
  isOwner?: boolean;
  onOpenSource: (sourceId: string, startTime?: number) => void;
  onToolsChange?: () => void;
}) {
  const [artifacts, setArtifacts] = useState<StudioArtifact[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [focus, setFocus] = useState("");
  const [tab, setTab] = useState<"studio" | "memory" | "tools">("studio");

  async function load() {
    const data = await api<{ artifacts: StudioArtifact[] }>(`/api/notebooks/${notebookId}/studio`);
    setArtifacts(data.artifacts);
  }

  useEffect(() => {
    void load();
  }, [notebookId, refreshToken]);

  async function generate(kind: StudioKind) {
    setBusy(kind);
    try {
      await api(`/api/notebooks/${notebookId}/studio`, {
        method: "POST",
        body: JSON.stringify({ kind, focus: focus || undefined }),
      });
      await load();
      toast.success("Studio artifact ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  }

  const latest = (type: string) => artifacts.find((a) => a.type === type);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] font-medium tracking-[0.16em] text-chai uppercase">Studio</p>
        <h2 className="font-heading text-lg leading-tight">Beyond the chat</h2>
        <div className="mt-3 flex gap-0.5 rounded-full bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setTab("studio")}
            className={tab === "studio" ? "flex-1 rounded-full bg-background px-2 py-1.5 text-xs font-medium shadow-sm" : "flex-1 rounded-full px-2 py-1.5 text-xs text-muted-foreground"}
          >
            Artifacts
          </button>
          <button
            type="button"
            onClick={() => setTab("memory")}
            className={tab === "memory" ? "flex-1 rounded-full bg-background px-2 py-1.5 text-xs font-medium shadow-sm" : "flex-1 rounded-full px-2 py-1.5 text-xs text-muted-foreground"}
          >
            Memory
          </button>
          <button
            type="button"
            onClick={() => setTab("tools")}
            className={tab === "tools" ? "flex-1 rounded-full bg-background px-2 py-1.5 text-xs font-medium shadow-sm" : "flex-1 rounded-full px-2 py-1.5 text-xs text-muted-foreground"}
          >
            Tools
          </button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          {tab === "memory" ? (
            <MemoryPanel notebookId={notebookId} />
          ) : tab === "tools" ? (
            <McpPanel notebookId={notebookId} isOwner={isOwner} onChange={onToolsChange} />
          ) : (
            <>
          <Input placeholder="Optional focus (exam, beginner, chapter 3…)" value={focus} onChange={(e) => setFocus(e.target.value)} />
          <StudioCards busy={busy} hasYoutube={hasYoutube} onGenerate={(kind) => void generate(kind)} />
          <button
            type="button"
            onClick={() => setTab("memory")}
            className="surface flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition hover:border-chai/45"
          >
            <BrainIcon className="size-4 text-chai" />
            <span>
              <p className="text-sm font-medium">Memory</p>
              <p className="text-[11px] text-muted-foreground">Pins, graph, and episodes</p>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("tools")}
            className="surface flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition hover:border-chai/45"
          >
            <PlugIcon className="size-4 text-chai" />
            <span>
              <p className="text-sm font-medium">Tools</p>
              <p className="text-[11px] text-muted-foreground">GitHub, Jira, Postgres, MCP</p>
            </span>
          </button>

          {latest("podcast") && <PodcastPlayer artifact={latest("podcast")!} />}
          {latest("explainer") && (
            <ExplainerView artifact={latest("explainer")!} onOpenSource={onOpenSource} />
          )}
          {latest("roadmap") && (
            <RoadmapView
              artifact={latest("roadmap")!}
              onOpenSource={onOpenSource}
            />
          )}
          {latest("guide") && <GuideView artifact={latest("guide")!} />}
          {latest("faq") && <FaqView artifact={latest("faq")!} />}
          {latest("cards") && <CardsView artifact={latest("cards")!} />}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ExplainerView({
  artifact,
  onOpenSource,
}: {
  artifact: StudioArtifact;
  onOpenSource: (sourceId: string, startTime?: number) => void;
}) {
  const payload = artifact.payload as ExplainerPayload;
  const scenes = useMemo(() => payload.scenes || [], [payload.scenes]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scene: ExplainerScene | undefined = scenes[i];
  const urls = useMemo(
    () => scenes.map((s) => (s.audioBase64 ? `data:${s.mimeType || "audio/mpeg"};base64,${s.audioBase64}` : null)),
    [scenes],
  );

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  function speakBrowser(seg: ExplainerScene, index: number) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(seg.narration);
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => /female|samantha|victoria|karen|meera/i.test(v.name)) || voices[1] || null;
    u.rate = 1.02;
    u.onend = () => {
      if (index + 1 < scenes.length) playAt(index + 1);
      else setPlaying(false);
    };
    window.speechSynthesis.speak(u);
  }

  function playAt(index: number) {
    setI(index);
    setPlaying(true);
    const url = urls[index];
    const seg = scenes[index];
    if (url) {
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      void audio.play();
      audio.onended = () => {
        if (index + 1 < scenes.length) playAt(index + 1);
        else setPlaying(false);
      };
    } else if (seg) {
      speakBrowser(seg, index);
    }
  }

  function toggle() {
    if (playing) {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      setPlaying(false);
      return;
    }
    playAt(i);
  }

  if (!scene) return null;

  return (
    <section className="rounded-2xl bg-secondary/60 p-4 ring-1 ring-border">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-chai">Video overview · Explainer</p>
          <h3 className="font-heading text-lg leading-tight">{payload.title}</h3>
          {payload.thesis && <p className="mt-1 text-sm text-muted-foreground">{payload.thesis}</p>}
        </div>
        <Button size="icon" onClick={toggle}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
      </div>
      <audio ref={audioRef} className="hidden" />
      <div className="mt-4 rounded-2xl bg-card p-4 ring-1 ring-chai/20">
        <p className="text-[11px] font-medium tracking-[0.14em] text-chai uppercase">
          Scene {i + 1} / {scenes.length}
        </p>
        <p className="mt-2 font-heading text-2xl leading-tight">{scene.heading}</p>
        {scene.visual && scene.visual !== scene.heading && (
          <p className="mt-2 text-sm italic text-chai/90">{scene.visual}</p>
        )}
        <p className="mt-3 text-sm leading-6">{scene.narration}</p>
        {!!scene.bullets?.length && (
          <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
            {scene.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {scene.sourceId && (
          <button
            type="button"
            onClick={() => onOpenSource(scene.sourceId!, scene.startTime)}
            className="mt-3 text-left text-[11px] text-chai hover:underline"
          >
            {scene.sourceTitle}
            {scene.startTime != null ? ` · ${formatTime(scene.startTime)}` : ""}
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {scenes.map((s, idx) => (
          <button
            key={`${s.heading}-${idx}`}
            type="button"
            onClick={() => {
              window.speechSynthesis?.cancel();
              audioRef.current?.pause();
              setPlaying(false);
              setI(idx);
            }}
            className={
              idx === i
                ? "rounded-full bg-chai px-2.5 py-1 text-[11px] text-white"
                : "rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground"
            }
          >
            {idx + 1}
          </button>
        ))}
      </div>
    </section>
  );
}

function PodcastPlayer({ artifact }: { artifact: StudioArtifact }) {
  const payload = artifact.payload as { title: string; segments: PodcastSegment[]; tts?: boolean };
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urls = useMemo(
    () =>
      payload.segments.map((s) =>
        s.audioBase64 ? `data:${s.mimeType || "audio/mpeg"};base64,${s.audioBase64}` : null,
      ),
    [payload.segments],
  );

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  function speakBrowser(seg: PodcastSegment, index: number) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(seg.text);
    const voices = window.speechSynthesis.getVoices();
    u.voice =
      voices.find((v) => (seg.speaker === "male" ? /male|daniel|alex|fred/i.test(v.name) : /female|samantha|victoria|karen/i.test(v.name))) ||
      voices[seg.speaker === "male" ? 0 : 1] ||
      null;
    u.rate = 1.02;
    u.onend = () => {
      if (index + 1 < payload.segments.length) playAt(index + 1);
      else setPlaying(false);
    };
    window.speechSynthesis.speak(u);
  }

  function playAt(index: number) {
    setI(index);
    setPlaying(true);
    const seg = payload.segments[index];
    const url = urls[index];
    if (url) {
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      void audio.play();
      audio.onended = () => {
        if (index + 1 < payload.segments.length) playAt(index + 1);
        else setPlaying(false);
      };
    } else {
      speakBrowser(seg, index);
    }
  }

  function toggle() {
    if (playing) {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      setPlaying(false);
      return;
    }
    playAt(i);
  }

  return (
    <section className="rounded-2xl bg-secondary/60 p-4 ring-1 ring-border">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-chai">Audio overview</p>
          <h3 className="font-heading text-lg leading-tight">{payload.title}</h3>
        </div>
        <Button size="icon" onClick={toggle}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
      </div>
      <audio ref={audioRef} className="hidden" />
      <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {payload.segments.map((seg, idx) => (
          <li
            key={idx}
            className={idx === i ? "rounded-xl bg-card p-2.5 text-sm ring-1 ring-chai/30" : "rounded-xl p-2.5 text-sm text-muted-foreground"}
          >
            <span className="mr-2 text-[11px] font-semibold text-chai">{seg.name}</span>
            {seg.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

function RoadmapView({
  artifact,
  onOpenSource,
}: {
  artifact: StudioArtifact;
  onOpenSource: (sourceId: string, startTime?: number) => void;
}) {
  const payload = artifact.payload as { title: string; concept: string; nodes: RoadmapNode[] };
  return (
    <section>
      <p className="text-xs text-chai">Personalized from your videos</p>
      <h3 className="font-heading text-lg">{payload.title}</h3>
      <p className="text-sm text-muted-foreground">{payload.concept}</p>
      <ol className="relative mt-4 space-y-3 border-l border-chai/30 pl-4">
        {payload.nodes.map((n) => (
          <li key={n.id}>
            <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-chai" />
            <Badge variant="outline" className="mb-1 capitalize">
              {n.level}
            </Badge>
            <button type="button" className="block text-left" onClick={() => n.sourceId && onOpenSource(n.sourceId, n.startTime)}>
              <p className="font-medium">{n.title}</p>
              <p className="text-xs text-muted-foreground">{n.summary}</p>
              <p className="mt-1 text-[11px] text-chai">
                {n.sourceTitle}
                {n.startTime != null ? ` · ${formatTime(n.startTime)}` : ""} — {n.why}
              </p>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GuideView({ artifact }: { artifact: StudioArtifact }) {
  const p = artifact.payload as {
    title: string;
    overview: string;
    keyIdeas: string[];
    outline: { heading: string; bullets: string[] }[];
    openQuestions: string[];
  };
  return (
    <section className="space-y-3 text-sm">
      <h3 className="font-heading text-lg">{p.title}</h3>
      <p className="text-muted-foreground">{p.overview}</p>
      <ul className="list-disc pl-4">
        {(p.keyIdeas || []).map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
      {(p.outline || []).map((o) => (
        <div key={o.heading}>
          <p className="font-medium">{o.heading}</p>
          <ul className="list-disc pl-4 text-muted-foreground">
            {o.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function FaqView({ artifact }: { artifact: StudioArtifact }) {
  const p = artifact.payload as { title: string; items: { q: string; a: string }[] };
  return (
    <section className="space-y-3">
      <h3 className="font-heading text-lg">{p.title}</h3>
      {(p.items || []).map((item) => (
        <div key={item.q} className="rounded-xl bg-muted/50 p-3 text-sm">
          <p className="font-medium">{item.q}</p>
          <p className="mt-1 text-muted-foreground">{item.a}</p>
        </div>
      ))}
    </section>
  );
}

function CardsView({ artifact }: { artifact: StudioArtifact }) {
  const p = artifact.payload as { title: string; cards: { q: string; a: string }[] };
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="space-y-3">
      <h3 className="font-heading text-lg">{p.title}</h3>
      {(p.cards || []).map((card, i) => (
        <button
          key={`${card.q}-${i}`}
          type="button"
          onClick={() => setOpen(open === i ? null : i)}
          className="w-full rounded-xl bg-muted/50 p-3 text-left text-sm"
        >
          <p className="font-medium">{card.q}</p>
          {open === i && <p className="mt-2 text-muted-foreground">{card.a}</p>}
          {open !== i && <p className="mt-1 text-[11px] text-chai">Reveal answer</p>}
        </button>
      ))}
    </section>
  );
}

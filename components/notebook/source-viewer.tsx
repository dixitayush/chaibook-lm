"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import type { Citation, Source } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmailPane } from "./email-pane";

export function SourceViewer({
  source,
  citation,
  playNonce,
  onClose,
}: {
  source: Source | null;
  citation: Citation | null;
  playNonce?: number;
  onClose: () => void;
}) {
  const [chunks, setChunks] = useState<{ id: string; content: string; page?: number | null; startTime?: number | null }[]>([]);

  useEffect(() => {
    if (!source || source.type === "email") return;
    void fetch(`/api/sources/${source.id}/chunks`)
      .then((r) => r.json())
      .then((d) => setChunks(d.chunks ?? []));
  }, [source?.id, source?.type]);

  const highlightId = citation?.chunkId;
  const videoId = source?.metadata.videoId || citation?.videoId;

  const pdfUrl = useMemo(() => {
    if (!source || source.type !== "pdf") return null;
    const page = citation?.page;
    return `/api/sources/${source.id}/file${page ? `#page=${page}` : ""}`;
  }, [source, citation]);

  if (!source) return null;

  return (
    <div className="flex h-full flex-col bg-card">
      {source.type === "email" ? (
        <EmailPane source={source} citation={citation} onClose={onClose} />
      ) : (
        <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-chai uppercase">{source.type}</p>
          <h3 className="font-heading text-xl leading-tight">{source.title}</h3>
          {source.type === "calendar" && source.metadata.eventCount != null && (
            <p className="text-xs text-muted-foreground">{source.metadata.eventCount} events</p>
          )}
          {source.metadata.driveFileId && source.url && (
            <a href={source.url} target="_blank" rel="noreferrer" className="text-xs text-chai hover:underline">
              Open in Drive
            </a>
          )}
          {citation && (
            <p className="text-xs text-muted-foreground">
              {citation.page != null && `Page ${citation.page}`}
              {citation.startTime != null && ` ${formatTime(citation.startTime)}`}
              {citation.heading ? ` · ${citation.heading}` : ""}
            </p>
          )}
          {source.type === "youtube" && source.metadata.transcriptSource === "gemini" && (
            <p className="text-[11px] text-muted-foreground">Transcribed with Gemini — the video had no captions.</p>
          )}
          {source.type === "youtube" && source.metadata.transcriptSource === "description" && (
            <p className="text-[11px] text-muted-foreground">Indexed from the video description — captions were unavailable.</p>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {source.type === "pdf" && pdfUrl ? (
          <iframe title={source.title} src={pdfUrl} className="h-full w-full bg-muted" />
        ) : source.type === "youtube" && videoId ? (
          <div className="flex h-full flex-col gap-3">
            <YoutubeEmbed videoId={videoId} start={citation?.startTime} playNonce={playNonce ?? 0} title={source.title} />
            <ChunkList chunks={chunks} highlightId={highlightId} />
          </div>
        ) : source.type === "website" && source.url ? (
          <div className="flex h-full flex-col">
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="border-b border-border px-4 py-2 text-xs text-chai hover:underline"
            >
              Open original → {source.url}
            </a>
            <iframe title={source.title} src={source.url} className="min-h-0 flex-1 bg-background" />
          </div>
        ) : (
          <ChunkList chunks={chunks} highlightId={highlightId} fullText={source.content} />
        )}
      </div>
        </>
      )}
    </div>
  );
}

function YoutubeEmbed({
  videoId,
  start,
  playNonce,
  title,
}: {
  videoId: string;
  start?: number;
  playNonce: number;
  title: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = boxRef.current;
    if (!host) return;
    const mount = document.createElement("div");
    mount.className = "h-full w-full";
    host.replaceChildren(mount);

    type Player = {
      playVideo: () => void;
      destroy: () => void;
      mute: () => void;
      unMute: () => void;
      setVolume: (n: number) => void;
    };
    type YT = { Player: new (el: HTMLElement, opts: Record<string, unknown>) => Player };
    type YTWin = Window & { YT?: YT; onYouTubeIframeAPIReady?: () => void };

    let player: Player | null = null;
    let cancelled = false;
    const w = window as YTWin;

    function create(api: YT) {
      if (cancelled) return;
      player = new api.Player(mount, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          mute: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          start: start != null ? Math.floor(start) : 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: { target: Player }) => {
            e.target.playVideo();
            e.target.unMute();
            e.target.setVolume(100);
          },
        },
      });
    }

    if (w.YT?.Player) {
      create(w.YT);
    } else {
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        prev?.();
        if (w.YT) create(w.YT);
      };
      if (!document.querySelector("script[src='https://www.youtube.com/iframe_api']")) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      try {
        player?.destroy();
      } catch {
        /* player may already be gone */
      }
    };
  }, [videoId, start, playNonce]);

  return (
    <div className="aspect-video w-full bg-black">
      <div ref={boxRef} className="h-full w-full" title={title} />
    </div>
  );
}

function ChunkList({
  chunks,
  highlightId,
  fullText,
}: {
  chunks: { id: string; content: string; page?: number | null; startTime?: number | null }[];
  highlightId?: string;
  fullText?: string | null;
}) {
  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`chunk-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  if (!chunks.length && fullText) {
    return (
      <ScrollArea className="h-full">
        <pre className="whitespace-pre-wrap p-5 font-sans text-sm leading-7">{fullText}</pre>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        {chunks.map((c) => (
          <div
            id={`chunk-${c.id}`}
            key={c.id}
            className={
              c.id === highlightId
                ? "rounded-xl bg-saffron/15 p-3 text-sm leading-6 ring-1 ring-saffron/40"
                : "rounded-xl p-3 text-sm leading-6 text-muted-foreground"
            }
          >
            {c.content}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

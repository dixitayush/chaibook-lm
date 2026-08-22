"use client";

import { useEffect, useState } from "react";
import { PinIcon, PinOffIcon, PlusIcon, Trash2Icon, BrainIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { EpisodeItem, GraphSnapshot, MemoryItem } from "@/lib/types";
import { formatRelative } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function MemoryPanel({ notebookId }: { notebookId: string }) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [graph, setGraph] = useState<GraphSnapshot>({ nodes: [], edges: [] });
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [mem0, setMem0] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await api<{
        memories: MemoryItem[];
        graph: GraphSnapshot;
        episodes: EpisodeItem[];
        mem0: boolean;
      }>(`/api/notebooks/${notebookId}/memory`);
      setMemories(data.memories);
      setGraph(data.graph);
      setEpisodes(data.episodes);
      setMem0(data.mem0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load memory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [notebookId]);

  async function pinFact() {
    const content = draft.trim();
    if (!content) return;
    await api(`/api/notebooks/${notebookId}/memory`, {
      method: "POST",
      body: JSON.stringify({ content, kind: "pin", pinned: true }),
    });
    setDraft("");
    await load();
    toast.success("Pinned to long-term memory");
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium tracking-wide text-chai uppercase">Long-term memory</p>
        <h3 className="font-heading text-lg">Facts the model should not forget</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Semantic facts + Mem0{mem0 ? " (cloud connected)" : " (local Postgres)"} · graph entities · episodic turns
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void pinFact();
        }}
      >
        <Input placeholder="Pin a fact, preference, or constraint…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button type="submit" size="sm" disabled={!draft.trim()}>
          <PlusIcon data-icon="inline-start" />
          Pin
        </Button>
      </form>

      {loading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-card ring-1 ring-border" />
      ) : (
        <ul className="space-y-2">
          {memories.length === 0 && (
            <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              Chat turns write graph + episode memory automatically. Pin anything that should always stay in context.
            </li>
          )}
          {memories.map((m) => (
            <li key={m.id} className="rounded-xl bg-card p-3 ring-1 ring-border">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm">{m.content}</p>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={async () => {
                    await api(`/api/notebooks/${notebookId}/memory`, {
                      method: "PATCH",
                      body: JSON.stringify({ memoryId: m.id, pinned: !m.pinned }),
                    });
                    await load();
                  }}
                >
                  {m.pinned ? <PinOffIcon /> : <PinIcon />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={async () => {
                    await api(`/api/notebooks/${notebookId}/memory`, {
                      method: "DELETE",
                      body: JSON.stringify({ memoryId: m.id }),
                    });
                    await load();
                  }}
                >
                  <Trash2Icon />
                </Button>
              </div>
              <div className="mt-1.5 flex gap-1.5 text-[10px] text-muted-foreground">
                <Badge variant="outline" className="capitalize">
                  {m.kind}
                </Badge>
                {m.pinned && <span>pinned</span>}
                <span>{formatRelative(m.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <GraphView graph={graph} />

      <section>
        <div className="mb-2 flex items-center gap-2">
          <BrainIcon className="size-3.5 text-chai" />
          <h3 className="font-heading text-base">Episodic memory</h3>
        </div>
        {episodes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ask a question — each turn is stored as an episode with an embedding.</p>
        ) : (
          <ol className="space-y-2">
            {episodes.map((ep) => (
              <li key={ep.id} className="rounded-xl bg-muted/50 p-3 text-xs">
                <p className="font-medium">{ep.question}</p>
                <p className="mt-1 text-muted-foreground">{ep.summary || ep.answer.slice(0, 180)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function GraphView({ graph }: { graph: GraphSnapshot }) {
  const nodes = graph.nodes.slice(0, 16);
  if (!nodes.length) {
    return (
      <section className="rounded-2xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
        Knowledge graph fills as you chat — people, concepts, sources, and how they relate.
      </section>
    );
  }
  const w = 280;
  const h = 180;
  const cx = w / 2;
  const cy = h / 2;
  const r = 62;
  const pos = new Map(
    nodes.map((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      return [n.id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }];
    }),
  );
  return (
    <section>
      <h3 className="font-heading text-base">Knowledge graph</h3>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full rounded-2xl bg-card ring-1 ring-border">
        {graph.edges.map((e) => {
          const a = pos.get(e.fromId);
          const b = pos.get(e.toId);
          if (!a || !b) return null;
          return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" className="text-chai/30" strokeWidth="1.2" />;
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={14} className="fill-secondary stroke-chai/40" strokeWidth="1" />
              <text x={p.x} y={p.y + 28} textAnchor="middle" className="fill-foreground text-[8px]">
                {n.name.slice(0, 16)}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
        {graph.edges.slice(0, 12).map((e) => (
          <li key={e.id}>
            <span className="text-foreground">{e.fromName}</span>{" "}
            <span className="text-chai">{e.type.toLowerCase()}</span>{" "}
            <span className="text-foreground">{e.toName}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

"use client";

import { BookOpenIcon } from "lucide-react";
import type { Citation } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export function CitationsPanel({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (c: Citation) => void;
}) {
  const groups = groupBySource(citations);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] font-medium tracking-[0.16em] text-chai uppercase">This answer</p>
        <h2 className="font-heading text-lg leading-tight">Passages</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {citations.length} source{citations.length === 1 ? "" : "s"} · click to open
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-3 pb-8">
          {groups.length === 0 && (
            <p className="px-3 py-10 text-center text-sm leading-6 text-muted-foreground">
              Citations from the latest answer will land here.
            </p>
          )}
          {groups.map(([title, items]) => (
            <section key={items[0]?.sourceId ?? title}>
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-medium">
                <BookOpenIcon className="size-3.5 text-chai" />
                <span className="truncate">{title}</span>
              </p>
              <div className="space-y-2.5">
                {items.map((c) => (
                  <button
                    key={c.chunkId || `${c.sourceId}-${c.n}`}
                    type="button"
                    onClick={() => onOpen(c)}
                    className="w-full rounded-xl border border-border bg-card p-2.5 text-left transition hover:border-chai/50 hover:bg-secondary/60"
                  >
                    <p className="flex items-center gap-2 text-[11px] text-chai">
                      <span className="font-mono font-semibold">[{c.n}]</span>
                      {c.page != null && <span>p. {c.page}</span>}
                      {c.startTime != null && <span>{formatTime(c.startTime)}</span>}
                    </p>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{c.excerpt}</p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function groupBySource(citations: Citation[]) {
  const order: string[] = [];
  const map = new Map<string, Citation[]>();
  for (const c of citations) {
    const key = c.sourceId || c.sourceTitle;
    if (!map.has(key)) {
      order.push(key);
      map.set(key, []);
    }
    map.get(key)!.push(c);
  }
  return order.map((key) => {
    const items = map.get(key)!;
    return [items[0]?.sourceTitle || "Source", items] as const;
  });
}

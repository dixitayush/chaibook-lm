"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowRightIcon,
  BookOpenIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Notebook } from "@/lib/types";
import { cn, formatRelative } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SteamWisp } from "./motion-bits";

const ease = [0.22, 1, 0.36, 1] as const;

const WASH = [
  "from-chai/30 via-card to-saffron/15",
  "from-saffron/25 via-card to-chai/20",
  "from-mauve/25 via-card to-chai/15",
  "from-chai/20 via-background to-saffron/20",
];

function wash(id: string) {
  return WASH[Math.abs(id.split("").reduce((n, c) => n + c.charCodeAt(0), 0)) % WASH.length];
}

function lean(id: string) {
  const tilts = [-2.6, -1.4, -0.5, 0.8, 1.6, 2.4, -1.9];
  return tilts[Math.abs(id.split("").reduce((n, c) => n + c.charCodeAt(0), 0)) % tilts.length];
}

function readyPct(nb: Notebook) {
  if (!nb.sourceCount) return 0;
  return Math.round(((nb.readyCount ?? 0) / nb.sourceCount) * 100);
}

type DeskProps = {
  notebooks: Notebook[];
  query: string;
  onQuery: (q: string) => void;
  loading: boolean;
  signedIn: boolean;
  onCreate: () => void;
  onReload: () => void;
  onRemove: (id: string) => void;
};

export function NotebookDesk({
  notebooks,
  query,
  onQuery,
  loading,
  signedIn,
  onCreate,
  onReload,
  onRemove,
}: DeskProps) {
  const router = useRouter();
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return notebooks
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.description.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notebooks, query]);
  const featured = filtered[0];
  const shelf = filtered.slice(1);

  async function rename(nb: Notebook) {
    const next = window.prompt("Rename notebook", nb.title);
    if (!next) return;
    await api(`/api/notebooks/${nb.id}`, { method: "PATCH", body: JSON.stringify({ title: next }) });
    onReload();
    toast.success("Renamed");
  }

  return (
    <section id="notebooks" className="scroll-mt-24 pt-10 sm:pt-14">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15, ease }}
        className="relative overflow-hidden rounded-[2rem] border border-chai/20 bg-card/55 px-4 py-7 shadow-[0_40px_80px_-48px_color-mix(in_srgb,var(--chai)_55%,transparent)] backdrop-blur-xl sm:px-7 sm:py-9"
      >
        <div className="pointer-events-none absolute inset-0 desk-paper opacity-40" />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/4 size-64 rounded-full bg-chai/20 blur-3xl"
          animate={{ opacity: [0.25, 0.5, 0.25], x: [0, 18, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-10 bottom-0 size-56 rounded-full bg-saffron/15 blur-3xl"
          animate={{ opacity: [0.18, 0.4, 0.18], y: [0, -14, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium tracking-[0.2em] text-chai uppercase">
                {signedIn ? "Your desk" : "The desk"}
              </span>
              <span className="relative flex h-6 items-end gap-1">
                <SteamWisp delay={0} className="h-6" />
                <SteamWisp delay={0.7} className="h-5" />
                <SteamWisp delay={1.3} className="h-7" />
              </span>
            </div>
            <h2 className="mt-2 font-heading text-3xl tracking-tight text-balance sm:text-5xl">
              {signedIn
                ? featured
                  ? "Pick up where the chai is still warm."
                  : "Your notebooks live here."
                : "Sign in and your notebooks pour in."}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              {signedIn
                ? featured
                  ? "The latest notebook sits up front. The rest wait on the shelf — open one, or pour a new cup."
                  : "One topic, one library. Start a notebook and it will land on this desk."
                : "Google or email. Shared notebooks appear here too."}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:max-w-md">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-full border-chai/20 bg-background/80 pl-9 shadow-none"
                placeholder="Find a notebook"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
              />
            </div>
            <Button className="h-11 shrink-0 rounded-full px-5" onClick={onCreate}>
              <PlusIcon data-icon="inline-start" />
              {signedIn ? "New notebook" : "Sign in"}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="relative mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="surface h-64 animate-pulse rounded-[1.75rem]" />
            <div className="grid gap-3">
              <div className="surface h-[7.5rem] animate-pulse rounded-3xl" />
              <div className="surface h-[7.5rem] animate-pulse rounded-3xl" />
            </div>
          </div>
        ) : query && !featured ? (
          <p className="relative mt-8 rounded-3xl border border-dashed border-border bg-background/50 px-5 py-10 text-center text-sm text-muted-foreground">
            No notebook matches “{query}”.
          </p>
        ) : !featured ? (
          <EmptyDesk signedIn={signedIn} onCreate={onCreate} />
        ) : (
          <div className={cn("relative mt-8 grid gap-4", shelf.length > 0 && "lg:grid-cols-[1.18fr_0.82fr]")}>
            <FeaturedCard
              notebook={featured}
              onOpen={() => router.push(`/notebooks/${featured.id}`)}
              onRename={() => void rename(featured)}
              onRemove={() => onRemove(featured.id)}
            />
            {shelf.length > 0 && (
              <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {shelf.map((nb, i) => (
                  <ShelfCard
                    key={nb.id}
                    notebook={nb}
                    index={i}
                    onOpen={() => router.push(`/notebooks/${nb.id}`)}
                    onRename={() => void rename(nb)}
                    onRemove={() => onRemove(nb.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </section>
  );
}

function EmptyDesk({ signedIn, onCreate }: { signedIn: boolean; onCreate: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onCreate}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="surface desk-shine relative mt-8 flex w-full flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border-dashed px-6 py-16 text-center"
    >
      <div className="relative">
        <motion.span
          className="absolute -top-7 left-1/2 -translate-x-1/2"
          animate={{ y: [0, -6, 0], opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <SteamWisp delay={0} />
        </motion.span>
        <span className="grid size-16 place-items-center rounded-3xl bg-secondary text-chai ring-1 ring-chai/20">
          <BookOpenIcon className="size-8" />
        </span>
      </div>
      <p className="mt-5 font-heading text-2xl sm:text-3xl">
        {signedIn ? "The desk is empty. Pour the first cup." : "Sign in to open your desk"}
      </p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {signedIn
          ? "Add sources, ask a question, and follow the citations."
          : "Your library stays on your account. Shared notebooks land here too."}
      </p>
      <span className="mt-5 inline-flex h-10 items-center rounded-full bg-chai px-5 text-sm font-medium text-chai-foreground">
        {signedIn ? "Create notebook" : "Sign in"}
        <ArrowRightIcon className="ml-1.5 size-4" />
      </span>
    </motion.button>
  );
}

function FeaturedCard({
  notebook,
  onOpen,
  onRename,
  onRemove,
}: {
  notebook: Notebook;
  onOpen: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const pct = readyPct(notebook);

  return (
    <motion.article
      initial={{ opacity: 0, y: 22, rotate: -1.2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.65, ease }}
      className="relative"
      style={{ perspective: 1200 }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTilt({
          x: ((e.clientY - r.top) / r.height - 0.5) * -8,
          y: ((e.clientX - r.left) / r.width - 0.5) * 10,
        });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <motion.div
        animate={{ rotateX: tilt.x, rotateY: tilt.y }}
        transition={{ type: "spring", stiffness: 180, damping: 20 }}
        className={cn(
          "surface desk-shine group relative overflow-hidden rounded-[1.75rem] bg-linear-to-br p-6 sm:p-7",
          wash(notebook.id),
        )}
        style={{ transformStyle: "preserve-3d" }}
      >
        <button type="button" className="absolute inset-0 z-0" onClick={onOpen} aria-label={`Open ${notebook.title}`} />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <motion.span
              className="grid size-14 place-items-center rounded-2xl bg-background/80 text-3xl shadow-sm ring-1 ring-chai/20"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
            >
              {notebook.emoji}
            </motion.span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-chai/25 bg-background/70 px-2.5 py-1 text-[11px] font-medium tracking-wide text-chai uppercase">
              <SparklesIcon className="size-3" />
              Still warm
            </span>
          </div>
          <CardActions notebook={notebook} onRename={onRename} onRemove={onRemove} />
        </div>
        <h3 className="relative z-10 mt-6 font-heading text-3xl leading-tight wrap-break-word sm:text-4xl">
          {notebook.title}
        </h3>
        <p className="relative z-10 mt-2 line-clamp-2 max-w-lg text-sm leading-6 text-muted-foreground">
          {notebook.description || "No description yet — open it and keep going."}
        </p>
        {notebook.role === "collaborator" && (
          <p className="relative z-10 mt-3 inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-chai uppercase">
            Shared{notebook.ownerName ? ` by ${notebook.ownerName}` : ""}
          </p>
        )}
        <div className="relative z-10 mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {notebook.readyCount ?? 0}/{notebook.sourceCount ?? 0} sources ready · {formatRelative(notebook.updatedAt)}
            </p>
            <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-chai"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease }}
              />
            </div>
          </div>
          <span className="inline-flex h-10 items-center rounded-full bg-chai px-4 text-sm font-medium text-chai-foreground shadow-[0_12px_28px_-16px_var(--chai)]">
            Continue
            <ArrowRightIcon className="ml-1.5 size-4" />
          </span>
        </div>
      </motion.div>
    </motion.article>
  );
}

function ShelfCard({
  notebook,
  index,
  onOpen,
  onRename,
  onRemove,
}: {
  notebook: Notebook;
  index: number;
  onOpen: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const pct = readyPct(notebook);
  return (
    <motion.article
      initial={{ opacity: 0, y: 18, rotate: lean(notebook.id) }}
      animate={{ opacity: 1, y: 0, rotate: lean(notebook.id) }}
      transition={{ delay: 0.12 + index * 0.07, duration: 0.5, ease }}
      whileHover={{ y: -8, rotate: 0, scale: 1.02 }}
      className="surface group relative overflow-hidden rounded-3xl p-4"
    >
      <button type="button" className="absolute inset-0 z-0" onClick={onOpen} aria-label={`Open ${notebook.title}`} />
      <div className="relative z-10 flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-xl ring-1 ring-border/70">
          {notebook.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-xl leading-tight wrap-break-word">{notebook.title}</h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {notebook.description || "No description yet."}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              {notebook.readyCount ?? 0}/{notebook.sourceCount ?? 0} ready
            </span>
            <span>{formatRelative(notebook.updatedAt)}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-chai" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <CardActions notebook={notebook} onRename={onRename} onRemove={onRemove} compact />
      </div>
    </motion.article>
  );
}

function CardActions({
  notebook,
  onRename,
  onRemove,
  compact,
}: {
  notebook: Notebook;
  onRename: () => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  if (notebook.role === "collaborator") return null;
  return (
    <div
      className={cn(
        "relative z-10 flex gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100",
        compact && "flex-col",
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Rename ${notebook.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onRename();
        }}
      >
        <PencilIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${notebook.title}`}
        onClick={(e) => {
          e.stopPropagation();
          if (confirm("Delete this notebook? Sources, chat, vectors, and memory go with it.")) onRemove();
        }}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}

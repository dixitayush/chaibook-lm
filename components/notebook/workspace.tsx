"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  PlusIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  Trash2Icon,
  PanelLeftIcon,
  PanelRightIcon,
  PencilIcon,
  Share2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Citation, Notebook, Source, SourceType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AddSourceDialog } from "./add-source";
import { ChatPanel } from "./chat-panel";
import { SourceViewer } from "./source-viewer";
import { StudioPanel } from "./studio-panel";
import { CitationsPanel } from "./citations-panel";
import { ShareDialog } from "./share-dialog";
import { sourceIcon, StatusPip, statusLabel } from "./status";

export function Workspace({ notebookId }: { notebookId: string }) {
  const router = useRouter();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<SourceType | null>(null);
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const [rightTab, setRightTab] = useState<"citations" | "studio">("studio");
  const [latestCites, setLatestCites] = useState<Citation[]>([]);
  const [viewer, setViewer] = useState<{ source: Source; citation: Citation | null; playNonce: number } | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [studioRev, setStudioRev] = useState(0);
  const [mobileTab, setMobileTab] = useState<"sources" | "chat" | "studio">("chat");
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [deleteNb, setDeleteNb] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [me, setMe] = useState<{ id: string; name: string; email: string } | null>(null);
  const [deleteAll, setDeleteAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const loadNb = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}`);
    if (res.status === 401) {
      router.replace("/?auth=1");
      return;
    }
    if (!res.ok) {
      router.replace("/");
      return;
    }
    const data = (await res.json()) as {
      notebook: Notebook;
      viewer?: { id: string; name: string; email: string };
    };
    setNotebook(data.notebook);
    setTitleDraft(data.notebook.title);
    if (data.viewer) setMe(data.viewer);
  }, [notebookId, router]);

  const loadSources = useCallback(async () => {
    const data = await api<{ sources: Source[] }>(`/api/notebooks/${notebookId}/sources`);
    setSources(data.sources);
  }, [notebookId]);

  const onCitationsChange = useCallback((c: Citation[]) => {
    setLatestCites(c);
    if (c.length) setRightTab("citations");
  }, []);

  useEffect(() => {
    void loadNb();
    void loadSources();
    void fetch(`/api/notebooks/${notebookId}/suggestions`)
      .then((r) => r.json())
      .then((d) => setSuggestions(d.suggestions ?? []));
  }, [loadNb, loadSources, notebookId]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("gmail");
    if (!q) return;
    if (q === "connected") {
      toast.success("Google connected — import mail, calendar, or Drive from this dialog");
      const kind = new URLSearchParams(window.location.search).get("kind");
      if (kind === "email" || kind === "calendar" || kind === "drive") setAddKind(kind);
      setAddOpen(true);
    }
    if (q === "error") toast.error("Google authorization failed");
    const url = new URL(window.location.href);
    url.searchParams.delete("gmail");
    url.searchParams.delete("kind");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  const pending = sources.some((s) => s.status !== "ready" && s.status !== "error");
  useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(() => void loadSources(), 1200);
    return () => window.clearInterval(t);
  }, [pending, loadSources]);

  const ready = sources.filter((s) => s.status === "ready").length;
  const chatReady = ready > 0 || Boolean(notebook?.mcpEnabled);

  function openCitation(c: Citation) {
    const source = sources.find((s) => s.id === c.sourceId);
    if (!source) return;
    setViewer({ source, citation: c, playNonce: Date.now() });
  }

  function openSource(sourceId: string, startTime?: number) {
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return;
    setViewer({
      source,
      citation: startTime != null
        ? {
            n: 0,
            chunkId: "",
            sourceId,
            sourceTitle: source.title,
            sourceType: source.type,
            excerpt: "",
            score: 0,
            startTime,
            videoId: source.metadata.videoId,
          }
        : null,
      playNonce: Date.now(),
    });
  }

  async function commitRename() {
    if (!notebook) return;
    const next = titleDraft.trim();
    setEditing(false);
    if (!next || next === notebook.title) {
      setTitleDraft(notebook.title);
      return;
    }
    await api(`/api/notebooks/${notebookId}`, { method: "PATCH", body: JSON.stringify({ title: next }) });
    await loadNb();
  }

  const isOwner = notebook?.role !== "collaborator";

  const chatProps = {
    notebookId,
    disabled: !chatReady,
    isOwner,
    viewerName: me?.name,
    viewerId: me?.id,
    onCite: openCitation,
    onCitationsChange,
    suggestions,
    hasYoutube: sources.some((s) => s.type === "youtube"),
    onStudioReady: () => {
      setRight(true);
      setRightTab("studio");
      setStudioRev((n) => n + 1);
    },
    onCleared: () => setStudioRev((n) => n + 1),
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/80 bg-background/85 px-3 backdrop-blur-xl">
        <Link href="/" className="hidden sm:block">
          <Logo />
        </Link>
        <Link href="/" className="sm:hidden">
          <Logo markOnly />
        </Link>
        <span className="text-muted-foreground/40">/</span>
        {editing && isOwner ? (
          <Input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              if (e.key === "Escape") {
                setTitleDraft(notebook?.title ?? "");
                setEditing(false);
              }
            }}
            className="h-8 max-w-xs font-heading"
          />
        ) : (
          <button
            type="button"
            onClick={() => isOwner && setEditing(true)}
            className={cn("flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-0.5", isOwner && "hover:bg-secondary")}
          >
            <span className="text-lg leading-none">{notebook?.emoji}</span>
            <span className="font-heading truncate text-[1.05rem] leading-none">{notebook?.title ?? "…"}</span>
            {isOwner && <PencilIcon className="size-3.5 shrink-0 text-muted-foreground" />}
          </button>
        )}
        {notebook?.role === "collaborator" && (
          <Badge variant="outline" className="hidden rounded-full sm:inline-flex">
            Shared
          </Badge>
        )}
        <Badge variant="outline" className="hidden rounded-full md:inline-flex">
          {ready}/{sources.length} ready
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          <ShareDialog
            notebookId={notebookId}
            title={notebook?.title ?? "Notebook"}
            isOwner={isOwner}
            open={shareOpen}
            onOpenChange={setShareOpen}
            onLeft={() => router.push("/")}
          />
          <Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" onClick={() => setLeft((v) => !v)} aria-label="Toggle sources">
            <PanelLeftIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" onClick={() => setRight((v) => !v)} aria-label="Toggle side panel">
            <PanelRightIcon />
          </Button>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShareOpen(true)}>
                <Share2Icon /> {isOwner ? "Share" : "Sharing"}
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuItem onClick={() => setEditing(true)}>
                    <PencilIcon /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteNb(true)}>
                    <Trash2Icon /> Delete notebook
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "hidden w-[300px] shrink-0 border-r border-border bg-sidebar lg:flex lg:flex-col",
            !left && "lg:hidden",
          )}
        >
          <SourcesColumn
            sources={sources}
            viewerId={me?.id}
            onAdd={() => setAddOpen(true)}
            onOpen={(s) => setViewer({ source: s, citation: null, playNonce: Date.now() })}
            onChange={() => void loadSources()}
            onDeleteAll={() => setDeleteAll(true)}
            onAskDelete={(id) => setPendingDelete(id)}
          />
        </aside>

        <main className="min-w-0 flex-1">
          <div className="flex h-11 items-center px-2.5 lg:hidden">
            <div className="flex w-full gap-0.5 rounded-full bg-muted p-0.5">
              {(["sources", "chat", "studio"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setMobileTab(tab)}
                  className={cn(
                    "flex-1 rounded-full py-1.5 text-xs font-medium capitalize transition",
                    mobileTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="hidden h-full lg:block">
            <ChatPanel {...chatProps} />
          </div>
          <div className="h-[calc(100%-2.75rem)] lg:hidden">
            {mobileTab === "chat" && <ChatPanel {...chatProps} />}
            {mobileTab === "sources" && (
              <SourcesColumn
                sources={sources}
                viewerId={me?.id}
                onAdd={() => setAddOpen(true)}
                onOpen={(s) => setViewer({ source: s, citation: null, playNonce: Date.now() })}
                onChange={() => void loadSources()}
                onDeleteAll={() => setDeleteAll(true)}
                onAskDelete={(id) => setPendingDelete(id)}
              />
            )}
            {mobileTab === "studio" && (
              <StudioPanel
                notebookId={notebookId}
                hasYoutube={sources.some((s) => s.type === "youtube")}
                refreshToken={studioRev}
                isOwner={isOwner}
                onOpenSource={openSource}
                onToolsChange={() => {
                  void loadNb();
                  void loadSources();
                }}
              />
            )}
          </div>
        </main>

        <aside
          className={cn(
            "hidden w-[340px] shrink-0 border-l border-border bg-sidebar lg:flex lg:flex-col",
            !right && "lg:hidden",
          )}
        >
          <div className="border-b border-border/80 p-2">
            <div className="flex gap-0.5 rounded-full bg-muted p-0.5">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-full py-1.5 text-xs font-medium transition",
                  rightTab === "citations" ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
                onClick={() => setRightTab("citations")}
              >
                Passages {latestCites.length ? `(${latestCites.length})` : ""}
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-full py-1.5 text-xs font-medium transition",
                  rightTab === "studio" ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
                onClick={() => setRightTab("studio")}
              >
                Studio
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {rightTab === "citations" ? (
              <CitationsPanel citations={latestCites} onOpen={openCitation} />
            ) : (
              <StudioPanel
                notebookId={notebookId}
                hasYoutube={sources.some((s) => s.type === "youtube")}
                refreshToken={studioRev}
                isOwner={isOwner}
                onOpenSource={openSource}
                onToolsChange={() => {
                  void loadNb();
                  void loadSources();
                }}
              />
            )}
          </div>
        </aside>
      </div>

      <AddSourceDialog
        notebookId={notebookId}
        open={addOpen}
        startKind={addKind}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) setAddKind(null);
        }}
        onAdded={() => void loadSources()}
      />

      <Sheet open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className={cn(
            "w-full gap-0 p-0 data-[side=right]:w-full",
            viewer?.source.type === "email"
              ? "data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-3xl"
              : "data-[side=right]:sm:max-w-2xl",
          )}
        >
          {viewer && (
            <SourceViewer
              source={viewer.source}
              citation={viewer.citation}
              playNonce={viewer.playNonce}
              onClose={() => setViewer(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteNb}
        onOpenChange={setDeleteNb}
        title="Delete this notebook?"
        description="The cupboard empties: sources, chat, Studio artifacts, indexed vectors, notebook memory, and related Mem0 records. This cannot be undone."
        onConfirm={async () => {
          await api(`/api/notebooks/${notebookId}`, { method: "DELETE" });
          router.push("/");
        }}
      />
      <ConfirmDialog
        open={deleteAll}
        onOpenChange={setDeleteAll}
        title="Remove every source?"
        description="The notebook stays empty. Every file, its vectors, source-tagged memory, leftover chat episodes, the knowledge graph, and Studio artifacts (podcast, explainer, FAQ, cards, briefing, roadmap) leave with them."
        confirmLabel="Remove all"
        onConfirm={async () => {
          await api(`/api/notebooks/${notebookId}/sources`, { method: "DELETE" });
          await loadSources();
          setStudioRev((n) => n + 1);
        }}
      />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Remove this source?"
        description="Its indexed passages leave. Memory, episodes, and graph nodes tagged to this file go with it."
        onConfirm={async () => {
          if (!pendingDelete) return;
          await fetch(`/api/sources/${pendingDelete}`, { method: "DELETE" });
          await loadSources();
          setStudioRev((n) => n + 1);
        }}
      />
    </div>
  );
}

function SourcesColumn({
  sources,
  viewerId,
  onAdd,
  onOpen,
  onChange,
  onDeleteAll,
  onAskDelete,
}: {
  sources: Source[];
  viewerId?: string;
  onAdd: () => void;
  onOpen: (s: Source) => void;
  onChange: () => void;
  onDeleteAll: () => void;
  onAskDelete: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.16em] text-chai uppercase">Sources</p>
          <h2 className="font-heading text-lg leading-tight">Knowledge base</h2>
        </div>
        <Button size="sm" className="rounded-full" onClick={onAdd}>
          <PlusIcon data-icon="inline-start" />
          Add
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-3 pb-6">
          {sources.length === 0 && (
            <button
              type="button"
              onClick={onAdd}
              className="w-full rounded-2xl border border-dashed border-border px-4 py-12 text-center transition hover:border-chai/50 hover:bg-card"
            >
              <p className="text-sm font-medium">No sources yet</p>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Add a PDF, site, video, note, or connect a tool in Studio.
              </p>
            </button>
          )}
          {sources.map((s, i) => {
            const Icon = sourceIcon(s.type);
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="surface rounded-2xl p-3 transition hover:border-chai/35"
              >
                <div className="flex items-start gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(s)}>
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-secondary">
                        <Icon className="size-3.5 text-chai" />
                      </span>
                      <span className="truncate text-sm font-medium">{s.title}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <StatusPip status={s.status} />
                      {statusLabel(s.status)}
                      {s.status === "ready" && ` · ${s.chunkCount} chunks`}
                      {s.metadata.progress != null && s.status === "indexing" && ` · ${s.metadata.progress}%`}
                      {s.authorName ? ` · added by ${s.authorId === viewerId ? "you" : s.authorName}` : ""}
                    </div>
                    {s.error && <p className="mt-1 text-[11px] text-destructive">{s.error}</p>}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" />}>
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={async () => {
                          await fetch(`/api/sources/${s.id}/reindex`, { method: "POST" });
                          onChange();
                          toast.message("Re-indexing");
                        }}
                      >
                        <RefreshCwIcon /> Re-index
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => onAskDelete(s.id)}>
                        <Trash2Icon /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {(s.status === "indexing" || s.status === "extracting" || s.status === "uploading") && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-chai transition-all"
                      style={{ width: `${s.status === "uploading" ? 12 : s.status === "extracting" ? 28 : s.metadata.progress ?? 40}%` }}
                    />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
      {sources.length > 0 && (
        <div className="border-t border-border p-2">
          <Button variant="ghost" size="sm" className="w-full text-destructive" onClick={onDeleteAll}>
            <Trash2Icon data-icon="inline-start" />
            Remove all sources
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowUpIcon,
  SparklesIcon,
  Trash2Icon,
  DownloadIcon,
  PinIcon,
  CopyIcon,
  SquareIcon,
  BrainIcon,
  MailIcon,
  FileTextIcon,
  PlugIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { ChatMessage, Citation, RetrievalHit } from "@/lib/types";
import { cn, formatTime, formatRelative, initials, uniqueSourceCount, visibleCitations } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { api } from "@/lib/api";
import { GroundedMarkdown } from "./markdown";
import { MicButton, SpeakButton, useVoiceInput } from "./voice-controls";
import { StudioCards, type StudioKind } from "./studio-cards";
import { EmailChatDialog } from "./email-chat-dialog";

export function ChatPanel({
  notebookId,
  disabled,
  isOwner = true,
  viewerName,
  viewerId,
  onCite,
  onCitationsChange,
  suggestions,
  hasYoutube = false,
  onStudioReady,
  onCleared,
}: {
  notebookId: string;
  disabled: boolean;
  isOwner?: boolean;
  viewerName?: string;
  viewerId?: string;
  onCite: (c: Citation) => void;
  onCitationsChange?: (c: Citation[]) => void;
  suggestions: string[];
  hasYoutube?: boolean;
  onStudioReady?: () => void;
  onCleared?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [memoryUsed, setMemoryUsed] = useState("");
  const [mcpUsed, setMcpUsed] = useState<string[]>([]);
  const [stage, setStage] = useState("");
  const [quality, setQuality] = useState<{ score: number; stored: boolean; attempts: number } | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [studioBusy, setStudioBusy] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const { listening, toggle: toggleMic, stop: stopMic } = useVoiceInput((text) => {
    setInput(text);
    if (boxRef.current) {
      boxRef.current.style.height = "auto";
      boxRef.current.style.height = `${Math.min(boxRef.current.scrollHeight, 128)}px`;
    }
  });

  useEffect(() => {
    void fetch(`/api/notebooks/${notebookId}/messages`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.messages ?? []) as ChatMessage[];
        setMessages(list);
        const last = [...list].reverse().find((m) => m.role === "assistant" && m.citations?.length);
        onCitationsChange?.(visibleCitations(last?.citations ?? []));
      });
  }, [notebookId, onCitationsChange]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, stage]);

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || streaming || disabled) return;
    stopMic();
    setInput("");
    if (boxRef.current) boxRef.current.style.height = "auto";
    setStreaming(true);
    setStage("Checking the question…");
    setQuality(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const user: ChatMessage = {
      id: `tmp_${Date.now()}`,
      notebookId,
      role: "user",
      content: q,
      citations: [],
      createdAt: Date.now(),
      authorName: viewerName,
      authorId: viewerId,
    };
    const assistant: ChatMessage = {
      id: `tmp_a_${Date.now()}`,
      notebookId,
      role: "assistant",
      content: "",
      citations: [],
      createdAt: Date.now(),
    };
    setMessages((m) => [...m, user, assistant]);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Chat failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let cites: Citation[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.replace(/^data: /, "");
          if (!line) continue;
          const evt = JSON.parse(line) as {
            type: string;
            text?: string;
            citations?: Citation[];
            retrieval?: RetrievalHit[];
            memory?: string;
            mcp?: string[];
            error?: string;
            stage?: string;
            score?: number;
            stored?: boolean;
            attempts?: number;
            pass?: boolean;
          };
          if (evt.type === "status") setStage(evt.text || evt.stage || "Working…");
          if (evt.type === "reset") {
            acc = "";
            cites = [];
            setMessages((m) => m.map((msg) => (msg.id === assistant.id ? { ...msg, content: "", citations: [] } : msg)));
          }
          if (evt.type === "meta") {
            cites = evt.citations ?? [];
            setMemoryUsed(evt.memory ?? "");
            setMcpUsed(evt.mcp ?? []);
            onCitationsChange?.(visibleCitations(cites));
            setMessages((m) => m.map((msg) => (msg.id === assistant.id ? { ...msg, citations: cites } : msg)));
          }
          if (evt.type === "delta" && evt.text) {
            acc += evt.text;
            const next = acc;
            setMessages((m) => m.map((msg) => (msg.id === assistant.id ? { ...msg, content: next, citations: cites } : msg)));
          }
          if (evt.type === "score" && evt.score != null) {
            setQuality({
              score: evt.score,
              stored: Boolean(evt.pass),
              attempts: evt.attempts ?? 1,
            });
          }
          if (evt.type === "done") {
            setStage("");
            setQuality({
              score: evt.score ?? 0,
              stored: Boolean(evt.stored),
              attempts: evt.attempts ?? 1,
            });
          }
          if (evt.type === "error") throw new Error(evt.error);
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        setMessages((m) => m.map((msg) => (msg.id === assistant.id && !msg.content ? { ...msg, content: "Stopped." } : msg)));
      } else {
        toast.error(err instanceof Error ? err.message : "Could not answer");
        setMessages((m) => m.filter((msg) => msg.id !== assistant.id || msg.content));
      }
    } finally {
      setStreaming(false);
      setStage("");
    }
  }

  async function generateStudio(kind: StudioKind) {
    if (disabled || studioBusy) return;
    setStudioBusy(kind);
    try {
      await api(`/api/notebooks/${notebookId}/studio`, {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      toast.success("Studio artifact ready — opening Studio");
      onStudioReady?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate");
    } finally {
      setStudioBusy(null);
    }
  }

  async function exportChat(format: "markdown" | "html") {
    try {
      const data = await api<{ filename: string; markdown: string; html: string }>(
        `/api/notebooks/${notebookId}/export`,
      );
      const body = format === "html" ? data.html : data.markdown;
      const mime = format === "html" ? "text/html" : "text/markdown";
      const blob = new Blob([body], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.filename}.${format === "html" ? "html" : "md"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export");
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="chat-shell flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/80 px-5 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.16em] text-chai uppercase">Chat</p>
          <h2 className="font-heading text-lg leading-tight sm:text-xl">Ask the notebook</h2>
        </div>
        <div className="flex gap-1 rounded-full border border-border bg-card/80 p-0.5">
          {memoryUsed || mcpUsed.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label="Context in use" />}
              >
                {mcpUsed.length ? <PlugIcon className="text-chai" /> : <BrainIcon className="text-chai" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 min-w-80 p-3">
                {mcpUsed.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1.5 text-[11px] font-medium tracking-wide text-chai uppercase">
                      Connected tools
                    </p>
                    <p className="text-[11px] leading-5 text-muted-foreground">{mcpUsed.join(" · ")}</p>
                  </div>
                )}
                {memoryUsed ? (
                  <>
                    <p className="mb-1.5 text-[11px] font-medium tracking-wide text-chai uppercase">
                      Memory in context
                    </p>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-sans text-[11px] leading-5 text-muted-foreground">
                      {memoryUsed}
                    </pre>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <IconTip label="Pin last answer" onClick={async () => {
            const last = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
            if (!last) return toast.error("No answer to pin yet");
            await fetch(`/api/notebooks/${notebookId}/memory`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: last.content.slice(0, 1200), kind: "pin", pinned: true }),
            });
            toast.success("Pinned to memory");
          }}>
            <PinIcon />
          </IconTip>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Export chat" />}>
              <DownloadIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void exportChat("markdown")}>
                <FileTextIcon /> Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportChat("html")}>
                <FileTextIcon /> HTML
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEmailOpen(true)}>
                <MailIcon /> Email transcript
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isOwner && (
            <IconTip label="Clear chat" onClick={() => setClearOpen(true)}>
              <Trash2Icon />
            </IconTip>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-7">
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-8"
            >
              <div className="relative overflow-hidden rounded-[1.75rem] border border-dashed border-border bg-card/80 px-6 py-12 text-center">
                <span className="pointer-events-none absolute inset-0 chai-glow opacity-60" />
                <span className="relative mx-auto grid size-12 place-items-center rounded-2xl bg-chai text-chai-foreground shadow-[0_12px_28px_-12px_var(--chai)]">
                  <SparklesIcon className="size-5" />
                </span>
                <p className="relative mt-5 font-heading text-2xl text-balance sm:text-[1.7rem]">
                  {disabled ? "Add a source or connect a tool" : "Start from a source, not a guess"}
                </p>
                <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  {disabled
                    ? "Chat unlocks after the first file, page, or video is ready — or after you connect an MCP tool in Studio → Tools."
                    : "Ask by typing or the mic. Answers stream with citations — tap the speaker for a spoken summary."}
                </p>
                {suggestions.length > 0 && !disabled && (
                  <div className="relative mt-7 flex flex-wrap justify-center gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void ask(s)}
                        className="max-w-xs rounded-full border border-border bg-background/90 px-3.5 py-2 text-left text-xs leading-5 shadow-sm transition hover:border-chai/50 hover:bg-secondary"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!disabled && (
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-chai uppercase">Studio</p>
                    <p className="mt-1 text-sm text-muted-foreground">Generate from this notebook — same tools as the Studio rail.</p>
                  </div>
                  <StudioCards
                    busy={studioBusy}
                    hasYoutube={hasYoutube}
                    disabled={disabled}
                    onGenerate={(kind) => void generateStudio(kind)}
                  />
                </div>
              )}
            </motion.div>
          )}

          {messages.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: Math.min(i * 0.02, 0.12) }}
              className={cn(
                "flex gap-3",
                m.role === "user" && (!m.authorId || m.authorId === viewerId) && "flex-row-reverse",
              )}
            >
              <AvatarMark
                role={m.role}
                name={m.role === "assistant" ? "ChaiBook" : m.authorId === viewerId || !m.authorName ? "You" : m.authorName}
                you={m.role === "user" && (!m.authorId || m.authorId === viewerId)}
              />
              {m.role === "user" ? (
                <div className={cn("max-w-[78%]", m.authorId && m.authorId !== viewerId && "text-left")}>
                  <p className={cn("mb-1.5 px-1 text-[11px] text-muted-foreground", (!m.authorId || m.authorId === viewerId) && "text-right")}>
                    <span className="font-medium">
                      {m.authorId && m.authorId !== viewerId ? m.authorName || "Someone" : "You"}
                    </span>
                    <span className="opacity-70"> · {formatRelative(m.createdAt)}</span>
                  </p>
                  <div
                    className={cn(
                      "px-4 py-3 text-sm leading-6",
                      m.authorId && m.authorId !== viewerId
                        ? "rounded-3xl rounded-tl-md border border-border bg-card"
                        : "rounded-3xl rounded-tr-md bg-chai text-chai-foreground shadow-[0_12px_28px_-18px_var(--chai)]",
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <p className="px-1 text-[11px] text-muted-foreground">
                    <span className="font-medium">ChaiBook</span>
                    <span className="opacity-70"> · {formatRelative(m.createdAt)}</span>
                  </p>
                  {m.content ? (
                    <div className="surface rounded-3xl rounded-tl-md px-5 py-4">
                      <GroundedMarkdown text={m.content} citations={m.citations} onCite={onCite} />
                      {streaming && m.id === lastAssistant?.id && <span className="chat-caret" />}
                    </div>
                  ) : (
                    <Thinking stage={stage} />
                  )}
                  {!!m.citations.length && (
                    <SourceChips citations={m.citations} onCite={onCite} />
                  )}
                  {m.content && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SpeakButton
                        notebookId={notebookId}
                        messageId={m.id}
                        text={m.content}
                        question={[...messages].slice(0, i).reverse().find((x) => x.role === "user")?.content}
                        disabled={streaming && m.id === lastAssistant?.id}
                      />
                      <Button variant="ghost" size="icon-xs" aria-label="Copy answer" onClick={() => void copyText(m.content)}>
                        <CopyIcon />
                      </Button>
                      {quality && m.id === lastAssistant?.id && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px]",
                            quality.stored ? "bg-secondary text-chai" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {quality.score}/10
                          {quality.stored ? " remembered" : " not saved"}
                          {quality.attempts > 1 ? ` · ${quality.attempts} tries` : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
          <div ref={bottom} />
        </div>
      </ScrollArea>

      {stage && streaming && (
        <div className="flex justify-center px-5 pb-1">
          <span className="rounded-full border border-chai/20 bg-card/90 px-3 py-1 text-[11px] text-chai shadow-sm backdrop-blur-md">
            {stage}
          </span>
        </div>
      )}

      <form
        className="px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <div
          className={cn(
            "mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border bg-card/95 px-3.5 py-2.5 shadow-[0_16px_40px_-24px_color-mix(in_srgb,var(--foreground)_32%,transparent)] backdrop-blur-md transition focus-within:border-chai/50 focus-within:ring-3 focus-within:ring-chai/20",
            listening ? "border-chai/55 ring-3 ring-chai/20" : "border-border",
          )}
        >
          <textarea
            ref={boxRef}
            rows={1}
            value={input}
            disabled={disabled || streaming}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            placeholder={
              disabled
                ? "Add a source or connect a tool to ask…"
                : listening
                  ? "Listening…"
                  : "Ask a question, or use the mic"
            }
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          {streaming ? (
            <Button type="button" size="icon" variant="secondary" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
              <SquareIcon className="size-3.5 fill-current" />
            </Button>
          ) : (
            <>
              <MicButton listening={listening} onToggle={toggleMic} disabled={disabled} />
              <Button type="submit" size="icon" disabled={disabled || !input.trim()} aria-label="Send">
                <ArrowUpIcon />
              </Button>
            </>
          )}
        </div>
        <p className="mx-auto mt-2 max-w-3xl px-1 text-center text-[11px] text-muted-foreground">
          Enter to send · mic to ask out loud · speaker on an answer for a spoken summary
        </p>
      </form>

      <EmailChatDialog notebookId={notebookId} open={emailOpen} onOpenChange={setEmailOpen} />
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear this chat?"
        description="The thread, chat memory, episode vectors, knowledge graph, and Studio artifacts (podcast, FAQ, cards, briefing, roadmap) leave. Sources and pinned facts stay."
        confirmLabel="Clear"
        onConfirm={async () => {
          await fetch(`/api/notebooks/${notebookId}/messages`, { method: "DELETE" });
          setMessages([]);
          setQuality(null);
          setMemoryUsed("");
          onCitationsChange?.([]);
          onCleared?.();
        }}
      />
    </div>
  );
}

function SourceChips({
  citations,
  onCite,
}: {
  citations: Citation[];
  onCite: (c: Citation) => void;
}) {
  const shown = visibleCitations(citations);
  const extra = uniqueSourceCount(citations) - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((c) => (
        <button
          key={c.chunkId || `${c.sourceId}-${c.n}`}
          type="button"
          onClick={() => onCite(c)}
          className="rounded-full border border-border bg-secondary/80 px-2.5 py-1 text-[11px] transition hover:border-chai/50 hover:bg-card"
        >
          <span className="font-mono text-chai">{c.n}</span> {c.sourceTitle}
          {c.page != null ? ` · p.${c.page}` : ""}
          {c.startTime != null ? ` · ${formatTime(c.startTime)}` : ""}
        </button>
      ))}
      {extra > 0 && (
        <span className="text-[11px] text-muted-foreground">+{extra} more used in the answer</span>
      )}
    </div>
  );
}

function AvatarMark({ role, name, you }: { role: "user" | "assistant"; name?: string; you?: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
        role === "user" ? "bg-secondary text-foreground" : "bg-chai text-chai-foreground shadow-[0_8px_18px_-12px_var(--chai)]",
      )}
      title={name}
    >
      {role === "assistant" ? "LM" : you ? "You" : initials(name || "?")}
    </span>
  );
}

function Thinking({ stage }: { stage: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-3xl rounded-tl-md border border-border bg-card px-5 py-3.5 text-sm text-muted-foreground">
      <span className="flex gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-chai [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-chai [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-chai" />
      </span>
      {stage || "Thinking…"}
    </div>
  );
}

function IconTip({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

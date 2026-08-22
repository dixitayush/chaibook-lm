"use client";

import { useEffect, useMemo } from "react";
import { MailIcon, XIcon } from "lucide-react";
import type { Citation, Source, SourceMeta } from "@/lib/types";
import { cleanMailBody, splitMailFooter } from "@/lib/ingest/mail-clean";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export function EmailPane({
  source,
  citation,
  onClose,
}: {
  source: Source;
  citation: Citation | null;
  onClose: () => void;
}) {
  const mail = useMemo(() => parseMailView(source.content, source.metadata), [source.content, source.metadata]);
  const reading = useMemo(() => splitMailFooter(cleanMailBody(mail.body)), [mail.body]);
  const from = splitAddress(mail.from);
  const to = splitAddress(mail.to);
  const when = formatMailDate(mail.date);
  const excerpt = citation?.excerpt?.trim() || "";

  useEffect(() => {
    document.getElementById("mail-hit")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [excerpt, source.id]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border bg-card px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-chai uppercase">
            <MailIcon className="size-3.5" />
            Message
          </p>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="-mr-1.5 -mt-1">
            <XIcon />
          </Button>
        </div>
        <h3 className="font-heading mt-1.5 text-[1.45rem] leading-snug text-foreground">
          {mail.subject || source.title || "(no subject)"}
        </h3>
        <div className="mt-4 flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-sm font-medium text-chai"
          >
            {initials(from.name || from.email || mail.subject)}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="truncate font-medium">{from.name || from.email || "Unknown sender"}</span>
              {from.name && from.email && (
                <span className="truncate text-xs text-muted-foreground">&lt;{from.email}&gt;</span>
              )}
            </div>
            {to.raw && (
              <p className="truncate text-xs text-muted-foreground">
                To {to.name || to.email || mail.to}
              </p>
            )}
            {when && <p className="text-xs text-muted-foreground">{when}</p>}
          </div>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <article className="mx-auto max-w-2xl px-5 py-6">
          <MailBody body={reading.body} excerpt={excerpt} />
          {reading.footer && (
            <p className="mt-8 border-t border-border pt-4 text-[12px] leading-5 text-muted-foreground">
              {reading.footer}
            </p>
          )}
        </article>
      </ScrollArea>
    </div>
  );
}

function MailBody({ body, excerpt }: { body: string; excerpt: string }) {
  const blocks = useMemo(() => splitMailBlocks(body), [body]);
  const needle = excerpt.replace(/\s+/g, " ").trim().slice(0, 120);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.quote) {
          return (
            <blockquote
              key={i}
              className="border-l-2 border-chai/40 pl-4 text-[13px] leading-6 text-muted-foreground"
            >
              {renderParagraphs(block.text, needle)}
            </blockquote>
          );
        }
        return (
          <div key={i} className="space-y-4 font-sans text-[15px] leading-7 text-foreground">
            {renderParagraphs(block.text, needle)}
          </div>
        );
      })}
    </div>
  );
}

function renderParagraphs(text: string, needle: string) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!paras.length) return <p className="text-muted-foreground">This message has no body.</p>;
  return paras.map((para, i) => (
    <p key={i} className="whitespace-pre-wrap">
      {highlight(para, needle)}
    </p>
  ));
}

function highlight(text: string, needle: string) {
  if (!needle || needle.length < 8) return text;
  const window = needle.slice(0, Math.min(needle.length, 80));
  const k = text.toLowerCase().indexOf(window.toLowerCase());
  if (k < 0) return text;
  return (
    <>
      {text.slice(0, k)}
      <mark id="mail-hit" className="rounded-sm bg-saffron/25 px-0.5 ring-1 ring-saffron/30">
        {text.slice(k, k + window.length)}
      </mark>
      {text.slice(k + window.length)}
    </>
  );
}

function parseMailView(content: string | null, meta: SourceMeta) {
  const raw = (content || "").replace(/\r\n/g, "\n").trim();
  const split = raw.search(/\n\n/);
  const head = split === -1 ? raw : raw.slice(0, split);
  const rest = split === -1 ? "" : raw.slice(split + 2);
  const fields: Record<string, string> = {};
  for (const line of head.split("\n")) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    if (key === "subject" || key === "from" || key === "to" || key === "date") {
      fields[key] = line.slice(i + 1).trim();
    }
  }
  const headed = Boolean(fields.subject || fields.from || fields.to || fields.date);
  return {
    subject: meta.subject || fields.subject || "",
    from: meta.from || fields.from || "",
    to: meta.to || fields.to || "",
    date: meta.date || fields.date || "",
    body: (headed ? rest : raw).trim(),
  };
}

function splitAddress(raw: string) {
  const value = raw.trim();
  const angle = value.match(/^(.*?)\s*<([^>]+)>$/);
  if (angle) return { raw: value, name: angle[1].replace(/^"|"$/g, "").trim(), email: angle[2].trim() };
  if (value.includes("@") && !value.includes(" ")) return { raw: value, name: "", email: value };
  return { raw: value, name: value, email: "" };
}

function initials(value: string) {
  const parts = value.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "M";
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("");
  return letters || "M";
}

function formatMailDate(value: string) {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function splitMailBlocks(body: string) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: { text: string; quote: boolean }[] = [];
  let buf: string[] = [];
  let quote = false;
  const flush = () => {
    const text = buf.join("\n").replace(/^>/gm, "").replace(/^ /gm, "").trim();
    if (text) blocks.push({ text, quote });
    buf = [];
  };
  for (const line of lines) {
    const isQuote = /^>/.test(line) || /^On .+ wrote:$/.test(line);
    if (buf.length && isQuote !== quote) flush();
    quote = isQuote;
    buf.push(line);
  }
  flush();
  if (!blocks.length) blocks.push({ text: body.trim(), quote: false });
  return blocks;
}

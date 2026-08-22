"use client";

import type { ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Citation } from "@/lib/types";
import { cn } from "@/lib/utils";

export function GroundedMarkdown({
  text,
  citations,
  onCite,
}: {
  text: string;
  citations: Citation[];
  onCite: (c: Citation) => void;
}) {
  const parts = splitCitations(text);
  return (
    <div className="prose-chai text-[15px]">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{inject(children, citations, onCite, parts)}</p>,
          li: ({ children }) => <li>{inject(children, citations, onCite, parts)}</li>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

function splitCitations(text: string) {
  return text;
}

function inject(
  children: ReactNode,
  citations: Citation[],
  onCite: (c: Citation) => void,
  _parts: string,
): ReactNode {
  return walk(children, citations, onCite);
}

function walk(node: ReactNode, citations: Citation[], onCite: (c: Citation) => void): ReactNode {
  if (typeof node === "string") return renderCitedString(node, citations, onCite);
  if (Array.isArray(node)) return node.map((n, i) => <span key={i}>{walk(n, citations, onCite)}</span>);
  return node;
}

function renderCitedString(text: string, citations: Citation[], onCite: (c: Citation) => void) {
  const re = /\[(\d+)\]/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const n = Number(m[1]);
    const cite = citations.find((c) => c.n === n);
    out.push(
      <button
        key={`${m.index}-${i++}`}
        type="button"
        onClick={() => cite && onCite(cite)}
        className={cn(
          "mx-0.5 inline-flex translate-y-[-1px] items-center rounded-md bg-chai/12 px-1.5 py-px font-mono text-[11px] font-semibold text-chai ring-1 ring-chai/20 hover:bg-chai/20",
        )}
      >
        {n}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

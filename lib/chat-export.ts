import { formatTime } from "@/lib/utils";
import type { ChatMessage, Citation, Notebook } from "@/lib/types";

function stamp(ts: number) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function speakerName(m: ChatMessage) {
  if (m.role === "assistant") return "ChaiBook";
  return m.authorName?.trim() || "You";
}

function citeLine(c: Citation) {
  const loc = [c.page != null ? `p. ${c.page}` : null, c.startTime != null ? formatTime(c.startTime) : null, c.heading]
    .filter(Boolean)
    .join(" · ");
  return `[${c.n}] ${c.sourceTitle}${loc ? ` (${loc})` : ""}`;
}

function asCitations(value: unknown): Citation[] {
  return Array.isArray(value) ? (value as Citation[]) : [];
}

export function filenameForChat(notebook: Pick<Notebook, "title">) {
  const slug = notebook.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${slug || "chaibook"}-chat`;
}

export function chatMarkdown(notebook: Pick<Notebook, "title" | "emoji">, messages: ChatMessage[]) {
  const turns = messages.filter((m) => m.content.trim());
  const lines = [
    `# ${notebook.emoji} ${notebook.title}`,
    "",
    `Exported from ChaiBook LM · ${stamp(Date.now())}`,
    `${turns.length} ${turns.length === 1 ? "message" : "messages"}`,
    "",
    "---",
    "",
  ];
  for (const m of turns) {
    const who = speakerName(m);
    lines.push(`## ${who} · ${stamp(m.createdAt)}`, "", m.content.trim(), "");
    const cites = asCitations(m.citations);
    if (m.role === "assistant" && cites.length) {
      lines.push("**Sources**", "");
      for (const c of cites) lines.push(`- ${citeLine(c)}`);
      lines.push("");
    }
  }
  if (!turns.length) lines.push("_This chat is empty._", "");
  return lines.join("\n");
}

export function chatHtml(notebook: Pick<Notebook, "title" | "emoji">, messages: ChatMessage[], note?: string) {
  const turns = messages.filter((m) => m.content.trim());
  const body = turns
    .map((m) => {
      const who = speakerName(m);
      const cites = asCitations(m.citations);
      const sources =
        m.role === "assistant" && cites.length
          ? `<p class="srcs">${cites.map((c) => escapeHtml(citeLine(c))).join("<br/>")}</p>`
          : "";
      return `<article class="${m.role}">
        <p class="who">${who} · ${escapeHtml(stamp(m.createdAt))}</p>
        <div class="body">${escapeHtml(m.content.trim()).replace(/\n/g, "<br/>")}</div>
        ${sources}
      </article>`;
    })
    .join("\n");
  const noteBlock = note?.trim()
    ? `<p class="note">${escapeHtml(note.trim()).replace(/\n/g, "<br/>")}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(notebook.emoji)} ${escapeHtml(notebook.title)} — chat</title>
  <style>
    body { margin: 0; background: #F8F5F2; color: #2b2428; font: 16px/1.55 "Source Sans 3", "Segoe UI", sans-serif; }
    main { max-width: 40rem; margin: 0 auto; padding: 2.25rem 1.25rem 3rem; }
    h1 { font-family: "Source Serif 4", Georgia, serif; font-size: 1.75rem; font-weight: 600; margin: 0 0 .35rem; }
    .meta { color: #6b5f66; font-size: .82rem; margin-bottom: 1.5rem; }
    .note { background: #efe6ee; border-radius: 14px; padding: .9rem 1rem; font-size: .9rem; }
    article { margin: 1.1rem 0; padding: 1rem 1.1rem; border-radius: 18px; background: #fff; border: 1px solid #e6ddd8; }
    article.user { background: #A376A2; color: #fff; border-color: transparent; }
    article.user .who, article.user .srcs { color: rgba(255,255,255,.82); }
    .who { margin: 0 0 .45rem; font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; color: #A376A2; font-weight: 600; }
    .body { white-space: pre-wrap; }
    .srcs { margin: .75rem 0 0; font-size: .78rem; color: #6b5f66; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(notebook.emoji)} ${escapeHtml(notebook.title)}</h1>
    <p class="meta">ChaiBook LM chat · ${escapeHtml(stamp(Date.now()))} · ${turns.length} ${turns.length === 1 ? "message" : "messages"}</p>
    ${noteBlock}
    ${body || "<p class='meta'>This chat is empty.</p>"}
  </main>
</body>
</html>`;
}

export function shareInviteHtml(opts: {
  notebookTitle: string;
  ownerName: string;
  notebookUrl: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;background:#F8F5F2;color:#2b2428;font:16px/1.55 'Segoe UI',sans-serif;">
  <div style="max-width:32rem;margin:0 auto;padding:2rem 1.25rem;">
    <p style="letter-spacing:.14em;text-transform:uppercase;color:#A376A2;font-size:.75rem;font-weight:600;">ChaiBook LM</p>
    <h1 style="font-family:Georgia,serif;font-size:1.5rem;font-weight:600;margin:.4rem 0 1rem;">${escapeHtml(opts.notebookTitle)} was shared with you</h1>
    <p>${escapeHtml(opts.ownerName)} invited you to this notebook. Sign in with this email address and it will be on your desk.</p>
    <p style="margin:1.6rem 0;"><a href="${escapeHtml(opts.notebookUrl)}" style="display:inline-block;background:#A376A2;color:#fff;text-decoration:none;padding:.7rem 1.15rem;border-radius:999px;">Open notebook</a></p>
    <p style="font-size:.82rem;color:#6b5f66;">If you do not have an account yet, create one with this same email, then open the link.</p>
  </div>
</body>
</html>`;
}

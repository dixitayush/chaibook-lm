import { cleanMailBody, htmlToReadableText, isWeakPlaintext } from "@/lib/ingest/mail-clean";

export type ParsedEmail = {
  from: string;
  to: string;
  subject: string;
  date: string;
  text: string;
};

export function formatEmailDocument(mail: ParsedEmail) {
  const lines = [
    mail.subject ? `Subject: ${mail.subject}` : null,
    mail.from ? `From: ${mail.from}` : null,
    mail.to ? `To: ${mail.to}` : null,
    mail.date ? `Date: ${mail.date}` : null,
    "",
    mail.text.trim(),
  ].filter((line) => line != null);
  return lines.join("\n").trim();
}

export function parseEmailInput(opts: {
  raw?: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  body?: string;
}): ParsedEmail {
  const raw = (opts.raw || "").trim();
  const looksLikeRfc = /^(from|subject|to|date|content-type):/im.test(raw);
  if (looksLikeRfc) {
    const parsed = parseRfc822(raw);
    return {
      from: opts.from?.trim() || parsed.from,
      to: opts.to?.trim() || parsed.to,
      subject: opts.subject?.trim() || parsed.subject,
      date: opts.date?.trim() || parsed.date,
      text: (opts.body?.trim() || parsed.text).slice(0, 400_000),
    };
  }
  return {
    from: (opts.from || "").trim(),
    to: (opts.to || "").trim(),
    subject: (opts.subject || "").trim(),
    date: (opts.date || "").trim(),
    text: (opts.body || raw).trim().slice(0, 400_000),
  };
}

export function parseRfc822(raw: string): ParsedEmail {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const split = normalized.search(/\n\n/);
  const headerBlock = split === -1 ? normalized : normalized.slice(0, split);
  const body = split === -1 ? "" : normalized.slice(split + 2);
  const headers = parseHeaders(headerBlock);
  const contentType = headers["content-type"] || "text/plain";
  const encoding = (headers["content-transfer-encoding"] || "7bit").toLowerCase();
  let text = extractBody(body, contentType, encoding);
  if (!text.trim()) text = htmlToReadableText(body);
  return {
    from: decodeMimeWords(headers.from || ""),
    to: decodeMimeWords(headers.to || ""),
    subject: decodeMimeWords(headers.subject || "Email"),
    date: headers.date || "",
    text: text.trim(),
  };
}

function parseHeaders(block: string) {
  const unfolded = block.replace(/\n[ \t]+/g, " ");
  const out: Record<string, string> = {};
  for (const line of unfolded.split("\n")) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (!out[key]) out[key] = value;
  }
  return out;
}

function extractBody(body: string, contentType: string, encoding: string) {
  const boundary = contentType.match(/boundary="?([^";\s]+)"?/i)?.[1];
  if (boundary && /multipart\//i.test(contentType)) {
    const parts = body.split(new RegExp(`--${escapeReg(boundary)}`));
    let plain = "";
    let html = "";
    for (const part of parts) {
      if (!part.trim() || part.trim() === "--") continue;
      const parsed = parseRfc822(part.trim());
      const ct = (part.match(/content-type:\s*([^\n;]+)/i)?.[1] || "").toLowerCase();
      if (ct.includes("text/plain") && parsed.text && !plain) plain = parsed.text;
      if (ct.includes("text/html") && parsed.text && !html) html = parsed.text;
    }
    const fromHtml = html ? htmlToReadableText(html) : "";
    const fromPlain = plain ? cleanMailBody(plain) : "";
    if (fromHtml && (isWeakPlaintext(fromPlain) || !fromPlain)) return fromHtml;
    return fromPlain || fromHtml;
  }
  const decoded = decodeTransfer(body, encoding);
  if (/html/i.test(contentType)) return htmlToReadableText(decoded);
  return cleanMailBody(decoded);
}

function decodeTransfer(body: string, encoding: string) {
  if (encoding.includes("base64")) {
    try {
      return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      return body;
    }
  }
  if (encoding.includes("quoted-printable")) return decodeQuotedPrintable(body);
  return body;
}

function decodeQuotedPrintable(input: string) {
  return input
    .replace(/=\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeMimeWords(value: string) {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (_m, _cs, enc: string, data: string) => {
    try {
      if (enc.toLowerCase() === "b") return Buffer.from(data, "base64").toString("utf8");
      return decodeQuotedPrintable(data.replace(/_/g, " "));
    } catch {
      return data;
    }
  });
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

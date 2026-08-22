/** Client-safe cleanup for marketing / multipart emails. No Node APIs. */

const TRACKING =
  /https?:\/\/[^\s<>"']+(?:campaign|click\.|unsubscribe|list-manage|mailchi|sendgrid|mandrill|exacttarget|salesforce|hubspot|constantcontact|\/r\/\?id=|email\/r\/)[^\s<>"']*/gi;

export function isWeakPlaintext(plain: string) {
  const text = plain.trim();
  if (!text) return true;
  if (/view this message in HTML/i.test(text)) return true;
  if (/To view this (?:email|message) in (?:your )?browser/i.test(text)) return true;
  const urls = text.match(/https?:\/\//g) || [];
  return urls.length >= 6 && urls.length * 80 > text.length * 0.35;
}

export function htmlToReadableText(html: string) {
  let s = html.replace(/\r\n/g, "\n");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|tr|h[1-6]|li|blockquote|table|section)>/gi, "\n\n");
  s = s.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (_m, inner: string) => {
    const label = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    return label && !/^https?:\/\//i.test(label) ? label : "";
  });
  s = s.replace(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/gi, " $1 ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return cleanMailBody(s);
}

export function cleanMailBody(raw: string) {
  let s = raw.replace(/\r\n/g, "\n");
  s = s.replace(/-{6,}[\s\S]*?To view this message in HTML format[\s\S]*?-{6,}/gi, "\n");
  s = s.replace(/To view this message in HTML format[\s\S]{0,500}?or paste this link in a Web browser/gi, "\n");
  s = s.replace(/If (?:you are )?unable to see the message[\s\S]{0,300}?browser[^\n]*/gi, "\n");
  s = s.replace(/-{6,}/g, "\n");
  s = s.replace(TRACKING, "");
  s = s.replace(/https?:\/\/(?:www\.)?(?:facebook|twitter|x|instagram|linkedin|youtube|whatsapp)\.com\/\S+/gi, "");
  s = s.replace(/^\s*https?:\/\/\S+\s*$/gm, "");
  s = s.replace(/You can follow us on\s*/gi, "");
  s = s.replace(/click here:\s*$/gim, "");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n[ \t]+/g, "\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export function splitMailFooter(body: string) {
  const match = body.match(
    /\n(?=Mutual Fund investments are subject|You are receiving this message because|This (?:email|message) was sent to|Unsubscribe|Disclaimer:)/i,
  );
  if (!match || match.index == null) return { body: body.trim(), footer: "" };
  return {
    body: body.slice(0, match.index).trim(),
    footer: body.slice(match.index).trim(),
  };
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)));
}

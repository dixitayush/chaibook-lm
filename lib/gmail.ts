import { getSessionUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { gmailAccounts } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { hydrateEnv, publicOrigin, sanitizePublicOrigin } from "@/lib/env";
import { formatEmailDocument, parseEmailInput, type ParsedEmail } from "@/lib/ingest/email";
import { cleanMailBody, htmlToReadableText, isWeakPlaintext } from "@/lib/ingest/mail-clean";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export function googleOAuthConfigured() {
  hydrateEnv();
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
}

export const gmailOAuthConfigured = googleOAuthConfigured;

function appUrl(req?: Request) {
  return publicOrigin(req);
}

export function redirectUri() {
  return `${appUrl()}/api/gmail/callback`;
}

export function encodeGmailState(notebookId: string, origin: string, kind?: string) {
  return Buffer.from(JSON.stringify({ n: notebookId, o: origin, k: kind || "" })).toString("base64url");
}

export function encodeLoginState(origin: string, csrf: string) {
  return Buffer.from(JSON.stringify({ t: "login", o: origin, s: csrf })).toString("base64url");
}

export function decodeLoginState(state: string) {
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      t?: string;
      o?: string;
      s?: string;
    };
    if (parsed.t === "login" && parsed.s) return { origin: sanitizePublicOrigin(parsed.o), csrf: parsed.s };
  } catch {
    /* not a login state */
  }
  return null;
}

export function decodeGmailState(state: string) {
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      n?: string;
      o?: string;
      k?: string;
    };
    if (parsed.n) return { notebookId: parsed.n, origin: sanitizePublicOrigin(parsed.o), kind: parsed.k || "" };
  } catch {
    /* older callback: notebook id only */
  }
  return { notebookId: state, origin: appUrl(), kind: "" };
}

export function gmailAuthUrl(notebookId: string, origin?: string, kind?: string) {
  hydrateEnv();
  const from = sanitizePublicOrigin(origin);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: encodeGmailState(notebookId, from, kind),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGmailCode(code: string, origin: string | undefined, userId: string) {
  hydrateEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) throw new Error(data.error || "Google authorization failed.");
  const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const me = (await profile.json()) as { email?: string };
  const now = Date.now();
  const email = me.email || "google";
  const [existing] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, userId));
  const row = {
    id: existing?.id || createId("gml"),
    userId,
    email,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || existing?.refreshToken || "",
    expiry: now + (data.expires_in || 3600) * 1000,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (!row.refreshToken) throw new Error("Google did not return a refresh token. Disconnect and connect Gmail again.");
  if (existing) {
    await db.update(gmailAccounts).set(row).where(eq(gmailAccounts.id, existing.id));
  } else {
    await db.insert(gmailAccounts).values(row);
  }
  return { email };
}

async function accountForUser(userId: string) {
  const [acc] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, userId));
  return acc ?? null;
}

export async function googleAccessToken() {
  const user = await getSessionUser();
  if (!user) throw new Error("Sign in to continue.");
  const acc = await accountForUser(user.id);
  if (!acc) throw new Error("Connect Google first.");
  if (acc.expiry - 60_000 > Date.now() && acc.accessToken) return acc.accessToken;
  hydrateEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      refresh_token: acc.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) throw new Error(data.error || "Could not refresh Gmail access.");
  await db
    .update(gmailAccounts)
    .set({ accessToken: data.access_token, expiry: Date.now() + (data.expires_in || 3600) * 1000, updatedAt: Date.now() })
    .where(eq(gmailAccounts.id, acc.id));
  return data.access_token;
}

export async function gmailStatus() {
  const configured = googleOAuthConfigured();
  const user = await getSessionUser();
  const acc = configured && user ? await accountForUser(user.id) : null;
  const scopes = { gmail: false, calendar: false, drive: false };
  if (acc) {
    try {
      const token = await googleAccessToken();
      const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
      const data = (await info.json()) as { scope?: string };
      const s = data.scope || "";
      scopes.gmail = s.includes("gmail");
      scopes.calendar = s.includes("calendar");
      scopes.drive = s.includes("drive");
    } catch {
      /* tokeninfo optional */
    }
  }
  return { configured, connected: Boolean(acc), email: acc?.email || null, scopes };
}

export async function disconnectGmail() {
  const user = await getSessionUser();
  if (!user) return;
  await db.delete(gmailAccounts).where(eq(gmailAccounts.userId, user.id));
}

type GmailPayload = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayload[];
  headers?: { name: string; value: string }[];
};

export async function importGmailMessages(query: string, max = 12) {
  const token = await googleAccessToken();
  const q = query.trim() || "in:inbox newer_than:90d";
  const list = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(20, Math.max(1, max))}&q=${encodeURIComponent(q)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const listed = (await list.json()) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!list.ok) throw new Error(listed.error?.message || "Could not list Gmail messages.");
  const ids = listed.messages ?? [];
  if (!ids.length) throw new Error("No Gmail messages matched that search.");
  const mails: (ParsedEmail & { gmailId: string })[] = [];
  for (const item of ids) {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const msg = (await res.json()) as { id?: string; payload?: GmailPayload; error?: { message?: string } };
    if (!res.ok || !msg.payload) continue;
    const headers = Object.fromEntries((msg.payload.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
    const extracted = gmailBodies(msg.payload);
    const parsed: ParsedEmail = {
      from: headers.from || "",
      to: headers.to || "",
      subject: headers.subject || "Gmail message",
      date: headers.date || "",
      text: extracted,
    };
    mails.push({ ...parsed, gmailId: msg.id || item.id, text: formatEmailDocument({ ...parsed, text: extracted }) });
  }
  if (!mails.length) throw new Error("Could not read those Gmail messages.");
  return mails;
}

function gmailBodies(payload: GmailPayload): string {
  const found = { html: "", plain: "" };
  collectGmailParts(payload, found);
  const fromHtml = found.html ? htmlToReadableText(found.html) : "";
  const fromPlain = found.plain ? cleanMailBody(found.plain) : "";
  if (fromHtml && (isWeakPlaintext(fromPlain) || fromHtml.length >= fromPlain.length * 0.6)) return fromHtml;
  return fromPlain || fromHtml || strip(found.html);
}

function collectGmailParts(payload: GmailPayload, out: { html: string; plain: string }) {
  const mime = (payload.mimeType || "").toLowerCase();
  if (payload.body?.data) {
    const decoded = decodeGmailBody(payload.body.data);
    if (mime.includes("html") && !out.html) out.html = decoded;
    else if (mime.includes("text/plain") && !out.plain) out.plain = decoded;
  }
  for (const part of payload.parts || []) collectGmailParts(part, out);
}

function decodeGmailBody(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function strip(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

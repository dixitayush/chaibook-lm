import { hydrateEnv, publicOrigin } from "@/lib/env";

const FALLBACK_FROM = "ChaiBook LM <hello@chaibook.ayushdixit.work>";

function hostnameOf(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
  }
}

function isLocalHost(value: string): boolean {
  const host = hostnameOf(value);
  return !host || host === "localhost" || host === "0.0.0.0" || host === "::" || host.endsWith(".localhost") || host.startsWith("127.");
}

function fromAddressForHost(host: string): string {
  return `ChaiBook LM <hello@${host}>`;
}

export function mailConfigured() {
  hydrateEnv();
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** Resend requires a From address on a domain you verified. Never fall back to example.com. */
export function mailFrom() {
  hydrateEnv();
  const configured = process.env.MAIL_FROM?.trim();
  if (configured && !configured.toLowerCase().includes("@example.com")) return configured;

  const host = [process.env.CHAIBOOK_HOST, process.env.APP_URL]
    .map((value) => (value ? hostnameOf(value) : ""))
    .find((value) => value && !isLocalHost(value));
  if (host) return fromAddressForHost(host);
  return FALLBACK_FROM;
}

export async function sendMail(opts: { to: string; subject: string; html: string; text: string }) {
  hydrateEnv();
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return { sent: false as const, error: "Email is not configured. Add RESEND_API_KEY to send mail." };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { sent: false as const, error: data.message || "Could not send email." };
  }
  return { sent: true as const };
}

export function appOrigin() {
  return publicOrigin();
}

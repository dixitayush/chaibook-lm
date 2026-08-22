import { hydrateEnv } from "@/lib/env";

export function mailConfigured() {
  hydrateEnv();
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function mailFrom() {
  hydrateEnv();
  return process.env.MAIL_FROM?.trim() || "ChaiBook LM <beth.t@example.com>";
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
  hydrateEnv();
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

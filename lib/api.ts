import { CSRF_COOKIE } from "@/lib/auth-cookies";
import { CSRF_HEADER } from "@/lib/csrf";

function csrfToken() {
  if (typeof document === "undefined") return "";
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    if (part.startsWith(`${CSRF_COOKIE}=`)) {
      try {
        return decodeURIComponent(part.slice(CSRF_COOKIE.length + 1));
      } catch {
        return part.slice(CSRF_COOKIE.length + 1);
      }
    }
  }
  return "";
}

function headersFor(init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const csrf = csrfToken();
  if (csrf && !headers.has(CSRF_HEADER)) headers.set(CSRF_HEADER, csrf);
  return headers;
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: headersFor(init),
  });
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
    if (refreshed.ok) {
      const retry = await fetch(url, {
        ...init,
        credentials: "same-origin",
        headers: headersFor(init),
      });
      return parse<T>(retry);
    }
  }
  return parse<T>(res);
}

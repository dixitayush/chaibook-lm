import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds?: number | null) {
  if (seconds == null || Number.isNaN(seconds)) return null;
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function formatRelative(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Unique sources to show under chat. Retrieval can use more internally. */
export const DISPLAY_SOURCE_LIMIT = 3;

export function visibleCitations<T extends { sourceId?: string; sourceTitle?: string }>(
  citations: T[],
  limit = DISPLAY_SOURCE_LIMIT,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of citations) {
    const key = c.sourceId || c.sourceTitle || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

export function uniqueSourceCount(citations: { sourceId?: string; sourceTitle?: string }[]) {
  return new Set(citations.map((c) => c.sourceId || c.sourceTitle || "")).size;
}

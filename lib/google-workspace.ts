import { googleAccessToken } from "@/lib/gmail";
import { formatCalendarDocument, type CalendarEvent } from "@/lib/ingest/calendar";
import type { SourceType } from "@/lib/types";

export type GoogleCalendarInfo = { id: string; name: string; primary?: boolean };

export async function listGoogleCalendars(): Promise<GoogleCalendarInfo[]> {
  const token = await googleAccessToken();
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as {
    items?: { id?: string; summary?: string; primary?: boolean }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || "Could not list calendars. Reconnect Google and enable the Calendar API.");
  return (data.items || [])
    .filter((item) => item.id)
    .map((item) => ({ id: item.id as string, name: item.summary || item.id || "Calendar", primary: item.primary }));
}

export async function importGoogleCalendar(opts: { calendarId?: string; days?: number; max?: number }) {
  const token = await googleAccessToken();
  const calendarId = encodeURIComponent(opts.calendarId || "primary");
  const days = Math.min(180, Math.max(1, opts.days || 30));
  const max = Math.min(100, Math.max(1, opts.max || 50));
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
    `?singleEvents=true&orderBy=startTime&maxResults=${max}` +
    `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json()) as {
    summary?: string;
    items?: GoogleCalEvent[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || "Could not read that calendar.");
  const events: CalendarEvent[] = (data.items || []).map((item) => ({
    uid: item.id || item.iCalUID || "",
    title: item.summary || "Untitled event",
    start: item.start?.dateTime || item.start?.date || "",
    end: item.end?.dateTime || item.end?.date || "",
    location: item.location || "",
    attendees: (item.attendees || []).map((a) => a.displayName || a.email || "").filter(Boolean).join(", "),
    description: (item.description || "").replace(/<[^>]+>/g, " ").trim().slice(0, 20_000),
  }));
  if (!events.length) throw new Error("No upcoming events in that range.");
  const name = data.summary || "Google Calendar";
  return {
    title: `${name} · next ${days} days`,
    text: formatCalendarDocument(events, name),
    calendarId: opts.calendarId || "primary",
    eventCount: events.length,
  };
}

type GoogleCalEvent = {
  id?: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string }[];
};

export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  folder: boolean;
  importable: boolean;
};

const FOLDER = "application/vnd.google-apps.folder";
const DOC = "application/vnd.google-apps.document";
const SHEET = "application/vnd.google-apps.spreadsheet";
const SLIDE = "application/vnd.google-apps.presentation";

export function driveImportable(mime: string) {
  return (
    mime === DOC ||
    mime === SHEET ||
    mime === SLIDE ||
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime === "message/rfc822" ||
    mime === "application/json"
  );
}

export async function listDriveFolder(folderId = "root") {
  const token = await googleAccessToken();
  const parent = folderId.trim() || "root";
  const q = `'${parent.replace(/'/g, "\\'")}' in parents and trashed = false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=80&orderBy=folder,name` +
      `&fields=files(id,name,mimeType)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json()) as {
    files?: { id?: string; name?: string; mimeType?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || "Could not list Drive. Reconnect Google and enable the Drive API.");

  let name = "My Drive";
  let parentId: string | null = null;
  if (parent !== "root") {
    const meta = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(parent)}?fields=id,name,parents`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const info = (await meta.json()) as { name?: string; parents?: string[] };
    if (meta.ok) {
      name = info.name || "Folder";
      parentId = info.parents?.[0] || "root";
    }
  }

  const items: DriveItem[] = (data.files || [])
    .filter((f) => f.id && f.name)
    .map((f) => ({
      id: f.id as string,
      name: f.name as string,
      mimeType: f.mimeType || "application/octet-stream",
      folder: f.mimeType === FOLDER,
      importable: driveImportable(f.mimeType || ""),
    }));

  return {
    folderId: parent,
    name,
    parentId,
    folders: items.filter((i) => i.folder),
    files: items.filter((i) => !i.folder),
  };
}

export type ImportedDriveFile = {
  type: SourceType;
  title: string;
  content?: string;
  fileData?: string;
  metadata: Record<string, unknown>;
};

export async function importDriveFiles(fileIds: string[]): Promise<ImportedDriveFile[]> {
  const ids = [...new Set(fileIds.map((id) => id.trim()).filter(Boolean))].slice(0, 12);
  if (!ids.length) throw new Error("Choose at least one Drive file.");
  const token = await googleAccessToken();
  const out: ImportedDriveFile[] = [];
  for (const id of ids) {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,webViewLink`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const meta = (await metaRes.json()) as {
      id?: string;
      name?: string;
      mimeType?: string;
      webViewLink?: string;
      error?: { message?: string };
    };
    if (!metaRes.ok) throw new Error(meta.error?.message || `Could not read Drive file ${id}.`);
    const mime = meta.mimeType || "";
    const title = meta.name || "Drive file";
    const baseMeta = { driveFileId: meta.id || id, mimeType: mime, filename: title, url: meta.webViewLink };

    if (mime === DOC || mime === SLIDE) {
      const text = await driveExport(token, id, "text/plain");
      if (!text.trim()) continue;
      out.push({ type: "drive", title, content: text, metadata: baseMeta });
      continue;
    }
    if (mime === SHEET) {
      const text = await driveExport(token, id, "text/csv");
      if (!text.trim()) continue;
      out.push({ type: "drive", title, content: text, metadata: baseMeta });
      continue;
    }
    if (mime === "application/pdf") {
      const bytes = await driveDownload(token, id);
      out.push({
        type: "pdf",
        title,
        fileData: bytes.toString("base64"),
        metadata: baseMeta,
      });
      continue;
    }
    if (mime.startsWith("text/") || mime === "application/json" || mime === "message/rfc822") {
      const bytes = await driveDownload(token, id);
      const content = bytes.toString("utf8");
      const type: SourceType = mime === "message/rfc822" ? "email" : "drive";
      out.push({ type, title, content, metadata: baseMeta });
    }
  }
  if (!out.length) throw new Error("None of those Drive files could be read as text or PDF.");
  return out;
}

async function driveExport(token: string, id: string, mimeType: string) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mimeType)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message || "Drive export failed.");
  }
  return (await res.text()).slice(0, 400_000);
}

async function driveDownload(token: string, id: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not download that Drive file.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > 12 * 1024 * 1024) throw new Error("Drive file is larger than 12MB.");
  return buf;
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  FileTextIcon,
  GlobeIcon,
  ClapperboardIcon,
  CaptionsIcon,
  StickyNoteIcon,
  MailIcon,
  CalendarIcon,
  FolderIcon,
  ChevronRightIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SourceType } from "@/lib/types";

const KINDS: { id: SourceType; label: string; hint: string; icon: typeof FileTextIcon }[] = [
  { id: "pdf", label: "PDF", hint: "Papers, slides, reports", icon: FileTextIcon },
  { id: "text", label: "Text", hint: "Paste a note or essay", icon: StickyNoteIcon },
  { id: "website", label: "Website", hint: "Any public URL", icon: GlobeIcon },
  { id: "youtube", label: "YouTube", hint: "Video or playlist", icon: ClapperboardIcon },
  { id: "transcript", label: "VTT / SRT", hint: "Caption files", icon: CaptionsIcon },
  { id: "email", label: "Email", hint: "Paste, .eml, or Gmail", icon: MailIcon },
  { id: "calendar", label: "Calendar", hint: ".ics or Google", icon: CalendarIcon },
  { id: "drive", label: "Drive", hint: "Pick a folder & files", icon: FolderIcon },
];

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  scopes?: { gmail: boolean; calendar: boolean; drive: boolean };
};

type DriveItem = { id: string; name: string; mimeType: string; folder: boolean; importable: boolean };
type DriveListing = {
  folderId: string;
  name: string;
  parentId: string | null;
  folders: DriveItem[];
  files: DriveItem[];
};

export function AddSourceDialog({
  notebookId,
  open,
  onOpenChange,
  onAdded,
  startKind,
}: {
  notebookId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
  startKind?: SourceType | null;
}) {
  const [kind, setKind] = useState<SourceType>(startKind || "pdf");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [gmailQuery, setGmailQuery] = useState("in:inbox newer_than:90d");
  const [googleBusy, setGoogleBusy] = useState(false);
  const [calendars, setCalendars] = useState<{ id: string; name: string }[]>([]);
  const [calendarId, setCalendarId] = useState("primary");
  const [calDays, setCalDays] = useState("30");
  const [drivePath, setDrivePath] = useState<{ id: string; name: string }[]>([{ id: "root", name: "My Drive" }]);
  const [driveListing, setDriveListing] = useState<DriveListing | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const googleKinds = kind === "email" || kind === "calendar" || kind === "drive";

  useEffect(() => {
    if (open && startKind) setKind(startKind);
  }, [open, startKind]);

  useEffect(() => {
    if (!open || !googleKinds) return;
    void fetch("/api/gmail/status")
      .then((r) => r.json())
      .then((d: GoogleStatus) => setGoogle(d))
      .catch(() => setGoogle({ configured: false, connected: false, email: null }));
  }, [open, googleKinds]);

  useEffect(() => {
    if (!open || kind !== "calendar" || !google?.connected || !google.scopes?.calendar) return;
    void fetch(`/api/notebooks/${notebookId}/calendar`)
      .then((r) => r.json())
      .then((d: { calendars?: { id: string; name: string }[]; error?: string }) => {
        if (d.calendars?.length) {
          setCalendars(d.calendars);
          setCalendarId(d.calendars.find((c) => c.id === "primary")?.id || d.calendars[0].id);
        }
      });
  }, [open, kind, google?.connected, google?.scopes?.calendar, notebookId]);

  const folderId = drivePath[drivePath.length - 1]?.id || "root";
  useEffect(() => {
    if (!open || kind !== "drive" || !google?.connected || !google.scopes?.drive) return;
    setDriveListing(null);
    setSelected(new Set());
    void fetch(`/api/notebooks/${notebookId}/drive?folderId=${encodeURIComponent(folderId)}`)
      .then((r) => r.json())
      .then((d: DriveListing & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        setDriveListing(d);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not list Drive"));
  }, [open, kind, google?.connected, google?.scopes?.drive, notebookId, folderId]);

  function reset() {
    setUrl("");
    setText("");
    setTitle("");
    setFrom("");
    setSubject("");
    setFile(null);
    setSelected(new Set());
  }

  function connectHref() {
    return `/api/gmail/connect?notebookId=${encodeURIComponent(notebookId)}&kind=${encodeURIComponent(kind)}`;
  }

  async function submit() {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("type", kind);
      if (title) form.set("title", title);
      if (url) form.set("url", url);
      if (kind === "email") {
        if (from) form.set("from", from);
        if (subject) form.set("subject", subject);
        if (text) form.set("text", text);
      } else if (text) {
        form.set("text", text);
      }
      if (file) form.set("file", file);
      const res = await fetch(`/api/notebooks/${notebookId}/sources`, { method: "POST", body: form });
      const data = (await res.json()) as { error?: string; playlist?: boolean };
      if (!res.ok) throw new Error(data.error || "Upload failed");
      toast.success(data.playlist ? "Playlist queued — each video is indexing" : "Source queued for indexing");
      onAdded();
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add source");
    } finally {
      setBusy(false);
    }
  }

  async function importGmail() {
    setGoogleBusy(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/gmail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: gmailQuery, max: 12 }),
      });
      const data = (await res.json()) as { error?: string; imported?: number };
      if (!res.ok) throw new Error(data.error || "Gmail import failed");
      toast.success(`Queued ${data.imported ?? 0} Gmail message${data.imported === 1 ? "" : "s"}`);
      onAdded();
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import Gmail");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function importCalendar() {
    setGoogleBusy(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId, days: Number(calDays) || 30 }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Calendar import failed");
      toast.success("Calendar queued for indexing");
      onAdded();
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import calendar");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function importDrive() {
    const fileIds = [...selected];
    if (!fileIds.length) {
      toast.error("Choose at least one file");
      return;
    }
    setGoogleBusy(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds }),
      });
      const data = (await res.json()) as { error?: string; imported?: number };
      if (!res.ok) throw new Error(data.error || "Drive import failed");
      toast.success(`Queued ${data.imported ?? 0} Drive file${data.imported === 1 ? "" : "s"}`);
      onAdded();
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import Drive files");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function disconnectGoogle() {
    setGoogleBusy(true);
    try {
      const res = await fetch("/api/gmail", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect");
      setGoogle({ configured: true, connected: false, email: null });
      toast.success("Google disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect Google");
    } finally {
      setGoogleBusy(false);
    }
  }

  const needsScope =
    kind === "email"
      ? google?.connected && google.scopes && !google.scopes.gmail
      : kind === "calendar"
        ? google?.connected && google.scopes && !google.scopes.calendar
        : kind === "drive"
          ? google?.connected && google.scopes && !google.scopes.drive
          : false;

  function toggleFile(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hideSubmit = kind === "drive" && google?.connected && google.scopes?.drive;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a source</DialogTitle>
          <DialogDescription>Choose a type, then drop a file or paste a link. Indexing starts right away.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border border-border p-2.5 text-left transition hover:bg-muted/60",
                kind === k.id && "border-chai bg-chai/8 ring-1 ring-chai/30",
              )}
            >
              <k.icon className="size-4 text-chai" />
              <span className="text-xs font-medium">{k.label}</span>
            </button>
          ))}
        </div>
        {kind !== "drive" && (
          <Input placeholder="Optional title" value={title} onChange={(e) => setTitle(e.target.value)} />
        )}
        {(kind === "website" || kind === "youtube") && (
          <>
            <Input
              placeholder={kind === "youtube" ? "https://youtube.com/watch?v=… or playlist" : "https://"}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {kind === "youtube" && (
              <p className="text-[11px] text-muted-foreground">
                Public videos index even without captions. A .vtt file is optional if you already have one.
              </p>
            )}
          </>
        )}
        {kind === "text" && <Textarea placeholder="Paste source text" value={text} onChange={(e) => setText(e.target.value)} />}
        {(kind === "pdf" || kind === "transcript") && (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground hover:border-chai/40">
            <input
              type="file"
              className="hidden"
              accept={kind === "pdf" ? "application/pdf,.pdf" : ".vtt,.srt,text/vtt,text/plain"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? file.name : kind === "pdf" ? "Drop a PDF or click to browse" : "Drop a .vtt or .srt transcript"}
          </label>
        )}
        {kind === "email" && (
          <div className="space-y-3">
            <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Input placeholder="From (name or address)" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Textarea
              placeholder="Paste the message body, or a full raw email"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground hover:border-chai/40">
              <input
                type="file"
                className="hidden"
                accept=".eml,message/rfc822"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? file.name : "Or drop a .eml file (Gmail → More → Download message)"}
            </label>
            <GoogleBox
              title="Gmail"
              google={google}
              needsScope={Boolean(needsScope)}
              scopeLabel="Gmail"
              connectHref={connectHref()}
              busy={googleBusy}
              onDisconnect={() => void disconnectGoogle()}
            >
              {google?.connected && google.scopes?.gmail && (
                <>
                  <Input
                    placeholder="Gmail search — in:inbox newer_than:90d"
                    value={gmailQuery}
                    onChange={(e) => setGmailQuery(e.target.value)}
                  />
                  <Button type="button" size="sm" disabled={googleBusy} onClick={() => void importGmail()}>
                    {googleBusy ? "Importing…" : "Import matching mail"}
                  </Button>
                </>
              )}
            </GoogleBox>
          </div>
        )}
        {kind === "calendar" && (
          <div className="space-y-3">
            <Textarea
              placeholder="Paste events, or drop an .ics export"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground hover:border-chai/40">
              <input
                type="file"
                className="hidden"
                accept=".ics,text/calendar"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? file.name : "Or drop an .ics file (Google Calendar → Settings → Export)"}
            </label>
            <GoogleBox
              title="Google Calendar"
              google={google}
              needsScope={Boolean(needsScope)}
              scopeLabel="Calendar"
              connectHref={connectHref()}
              busy={googleBusy}
              onDisconnect={() => void disconnectGoogle()}
            >
              {google?.connected && google.scopes?.calendar && (
                <>
                  <select
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    value={calendarId}
                    onChange={(e) => setCalendarId(e.target.value)}
                  >
                    {(calendars.length ? calendars : [{ id: "primary", name: "Primary" }]).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
                      value={calDays}
                      onChange={(e) => setCalDays(e.target.value)}
                    >
                      <option value="7">Next 7 days</option>
                      <option value="30">Next 30 days</option>
                      <option value="90">Next 90 days</option>
                    </select>
                    <Button type="button" size="sm" disabled={googleBusy} onClick={() => void importCalendar()}>
                      {googleBusy ? "Importing…" : "Import events"}
                    </Button>
                  </div>
                </>
              )}
            </GoogleBox>
          </div>
        )}
        {kind === "drive" && (
          <GoogleBox
            title="Google Drive"
            google={google}
            needsScope={Boolean(needsScope)}
            scopeLabel="Drive"
            connectHref={connectHref()}
            busy={googleBusy}
            onDisconnect={() => void disconnectGoogle()}
            unconfiguredHint="Drive needs a Google connection. Enable the Drive API, then pick a folder and the files to index."
          >
            {google?.connected && google.scopes?.drive && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  {drivePath.map((crumb, i) => (
                    <button
                      key={crumb.id + i}
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => setDrivePath((p) => p.slice(0, i + 1))}
                    >
                      {i > 0 && <ChevronRightIcon className="mr-1 inline size-3" />}
                      {crumb.name}
                    </button>
                  ))}
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                  {!driveListing && <p className="p-3 text-xs text-muted-foreground">Loading folder…</p>}
                  {driveListing && !driveListing.folders.length && !driveListing.files.length && (
                    <p className="p-3 text-xs text-muted-foreground">This folder is empty.</p>
                  )}
                  {driveListing?.folders.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm hover:bg-muted/60"
                      onClick={() => setDrivePath((p) => [...p, { id: item.id, name: item.name }])}
                    >
                      <FolderIcon className="size-3.5 text-chai" />
                      <span className="truncate">{item.name}</span>
                    </button>
                  ))}
                  {driveListing?.files.map((item) => (
                    <label
                      key={item.id}
                      className={cn(
                        "flex items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0",
                        item.importable ? "cursor-pointer" : "opacity-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={!item.importable}
                        checked={selected.has(item.id)}
                        onChange={() => toggleFile(item.id)}
                      />
                      <span className="min-w-0 truncate">{item.name}</span>
                      {!item.importable && <span className="ml-auto text-[10px] text-muted-foreground">skip</span>}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Docs, Sheets, Slides, PDFs, and text files. Choose up to 12.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSelected(
                        new Set(
                          (driveListing?.files || [])
                            .filter((f) => f.importable)
                            .slice(0, 12)
                            .map((f) => f.id),
                        ),
                      )
                    }
                  >
                    Select all in folder
                  </Button>
                  <Button type="button" size="sm" disabled={googleBusy || selected.size === 0} onClick={() => void importDrive()}>
                    {googleBusy ? "Importing…" : `Import selected (${selected.size})`}
                  </Button>
                </div>
              </div>
            )}
          </GoogleBox>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!hideSubmit && (
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? "Uploading…" : "Add to notebook"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoogleBox({
  title,
  google,
  needsScope,
  scopeLabel,
  connectHref,
  busy,
  onDisconnect,
  unconfiguredHint,
  children,
}: {
  title: string;
  google: GoogleStatus | null;
  needsScope: boolean;
  scopeLabel: string;
  connectHref: string;
  busy: boolean;
  onDisconnect: () => void;
  unconfiguredHint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-xs font-medium">{title}</p>
      {google && !google.configured && (
        <p className="text-xs text-muted-foreground">
          {unconfiguredHint || (
            <>
              Paste or upload works without Google. To connect, set{" "}
              <code className="font-mono">GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
              <code className="font-mono">GOOGLE_OAUTH_CLIENT_SECRET</code>, then enable the Gmail, Calendar, and Drive APIs.
            </>
          )}
        </p>
      )}
      {google?.configured && !google.connected && (
        <div className="space-y-2">
          <Button type="button" variant="outline" size="sm" onClick={() => (window.location.href = connectHref)}>
            Connect Google
          </Button>
          <p className="text-[11px] leading-5 text-muted-foreground">
            If Google says the app is being tested, open the Cloud project → OAuth consent screen (Audience) → add your Gmail as a Test user. Publishing the app is not required for local use.
          </p>
        </div>
      )}
      {needsScope && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Connected as {google?.email}, but {scopeLabel} access is missing. Reconnect to grant it.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => (window.location.href = connectHref)}>
            Reconnect Google
          </Button>
        </div>
      )}
      {google?.connected && !needsScope && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Connected as {google.email}</p>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      )}
      {children}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CheckIcon, LinkIcon, MailIcon, Share2Icon, UserPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ShareRow = {
  id: string;
  email: string;
  createdAt: number;
  hasAccount: boolean;
  name: string;
  you?: boolean;
};

type Owner = { name: string; email: string; you: boolean };
type SuggestHit = { id: string; email: string; name: string };

function Face({ name, you, owner }: { name: string; you?: boolean; owner?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
        owner ? "bg-chai text-chai-foreground" : "bg-secondary text-foreground",
      )}
    >
      {you ? "You" : initials(name)}
    </span>
  );
}

export function ShareDialog({
  notebookId,
  title,
  isOwner,
  open,
  onOpenChange,
  onLeft,
}: {
  notebookId: string;
  title: string;
  isOwner: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLeft?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [busy, setBusy] = useState(false);
  const [mailConfigured, setMailConfigured] = useState(true);
  const [hits, setHits] = useState<SuggestHit[]>([]);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  async function load() {
    const data = await api<{ shares: ShareRow[]; owner?: Owner; mailConfigured?: boolean }>(
      `/api/notebooks/${notebookId}/share`,
    );
    setShares(data.shares);
    setOwner(data.owner ?? null);
    setMailConfigured(data.mailConfigured !== false);
  }

  useEffect(() => {
    if (!open) {
      setEmail("");
      setHits([]);
      return;
    }
    void load().catch((err) => toast.error(err instanceof Error ? err.message : "Could not load sharing"));
  }, [open, notebookId]);

  useEffect(() => {
    if (!isOwner || email.trim().length < 1) {
      setHits([]);
      return;
    }
    const q = email.trim();
    const t = window.setTimeout(() => {
      void fetch(`/api/notebooks/${notebookId}/share/suggest?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d: { users?: SuggestHit[] }) => {
          setHits(d.users ?? []);
          setActive(0);
        })
        .catch(() => setHits([]));
    }, 140);
    return () => window.clearTimeout(t);
  }, [email, isOwner, notebookId]);

  async function invite(address = email) {
    const next = address.trim();
    if (!next) return;
    setBusy(true);
    try {
      const data = await api<{ share: ShareRow; emailed: boolean; mailError?: string }>(
        `/api/notebooks/${notebookId}/share`,
        { method: "POST", body: JSON.stringify({ email: next }) },
      );
      setShares((s) => [...s, data.share]);
      setEmail("");
      setHits([]);
      if (data.emailed) toast.success(`Invite sent to ${data.share.email}`);
      else toast.message(`${data.share.name} now has access`, { description: data.mailError });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not share");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(share: ShareRow) {
    await api(`/api/notebooks/${notebookId}/share/${share.id}`, { method: "DELETE" });
    setShares((s) => s.filter((x) => x.id !== share.id));
    if (!isOwner) {
      toast.success("You left this notebook");
      onOpenChange(false);
      onLeft?.();
      return;
    }
    toast.success(`Removed ${share.email}`);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/notebooks/${notebookId}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Popover.Root open={open} onOpenChange={(next) => onOpenChange(next)} modal={false}>
      <Popover.Trigger render={<Button variant="ghost" size="icon-sm" aria-label="Share notebook" />}>
        <Share2Icon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={8} className="isolate z-50">
          <Popover.Popup className="w-[min(24rem,calc(100vw-1.5rem))] origin-(--transform-origin) rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-[0_24px_60px_-28px_oklch(0.25_0.04_55/0.5)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="border-b border-border px-4 py-3.5">
              <Popover.Title className="font-heading text-base">Share “{title}”</Popover.Title>
              <Popover.Description className="mt-0.5 text-[12px] text-muted-foreground">
                {isOwner
                  ? "People you invite will see this notebook on their desk."
                  : "You can read and chat. The owner stays in control."}
              </Popover.Description>
            </div>

            {isOwner && (
              <form
                className="relative border-b border-border px-3 py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (hits[active]) void invite(hits[active].email);
                  else void invite();
                }}
              >
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <MailIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      autoComplete="off"
                      placeholder="Add people by name or email"
                      className="h-9 rounded-full pl-8"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (!hits.length) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setActive((i) => (i + 1) % hits.length);
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setActive((i) => (i - 1 + hits.length) % hits.length);
                        }
                        if (e.key === "Escape") setHits([]);
                      }}
                    />
                    {hits.length > 0 && (
                      <ul className="absolute top-[calc(100%+6px)] right-0 left-0 z-10 overflow-hidden rounded-xl border border-border bg-popover shadow-md">
                        {hits.map((h, i) => (
                          <li key={h.id}>
                            <button
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-sm hover:bg-secondary",
                                i === active && "bg-secondary",
                              )}
                              onMouseEnter={() => setActive(i)}
                              onClick={() => void invite(h.email)}
                            >
                              <Face name={h.name} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{h.name}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">{h.email}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Button type="submit" size="sm" className="rounded-full" disabled={busy || !email.trim()}>
                    <UserPlusIcon data-icon="inline-start" />
                    Invite
                  </Button>
                </div>
              </form>
            )}

            <div className="max-h-64 space-y-0.5 overflow-auto px-2 py-2">
              <p className="px-2 py-1.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                People with access
              </p>
              {owner && (
                <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                  <Face name={owner.name} you={owner.you} owner />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {owner.you ? "You" : owner.name}
                      <span className="ml-1.5 text-[10px] font-medium tracking-wide text-chai uppercase">
                        Owner
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{owner.email}</p>
                  </div>
                </div>
              )}
              {shares.map((s) => (
                <div key={s.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-secondary/70">
                  <Face name={s.name} you={s.you} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.you ? "You" : s.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {s.email}
                      {s.hasAccount ? " · can open it" : " · invite pending"}
                    </p>
                  </div>
                  {isOwner && (
                    <Button variant="ghost" size="icon-xs" aria-label={`Remove ${s.email}`} onClick={() => void revoke(s)}>
                      <XIcon />
                    </Button>
                  )}
                </div>
              ))}
              {isOwner && shares.length === 0 && (
                <p className="px-2 py-3 text-center text-[12px] text-muted-foreground">Only you can open this notebook so far.</p>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
              <Button variant="ghost" size="sm" className="rounded-full" onClick={() => void copyLink()}>
                {copied ? <CheckIcon data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              {!isOwner && (
                <Button variant="ghost" size="sm" className="ml-auto rounded-full text-destructive" onClick={() => shares[0] && void revoke(shares[0])}>
                  Leave
                </Button>
              )}
              {isOwner && !mailConfigured && (
                <p className="ml-auto max-w-[12rem] text-right text-[10px] leading-4 text-muted-foreground">
                  Access is saved. Add RESEND_API_KEY to email invites.
                </p>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

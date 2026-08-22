"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EmailChatDialog({
  notebookId,
  open,
  onOpenChange,
}: {
  notebookId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [mailConfigured, setMailConfigured] = useState(true);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    void fetch(`/api/notebooks/${notebookId}/export`)
      .then((r) => r.json())
      .then((d: { mailConfigured?: boolean; messageCount?: number }) => {
        setMailConfigured(d.mailConfigured !== false);
        setCount(d.messageCount ?? 0);
      });
  }, [open, notebookId]);

  async function send() {
    setBusy(true);
    try {
      await api(`/api/notebooks/${notebookId}/export`, {
        method: "POST",
        body: JSON.stringify({ to, note }),
      });
      toast.success(`Chat emailed to ${to}`);
      onOpenChange(false);
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Email this chat</DialogTitle>
          <DialogDescription>
            Sends a formatted transcript ({count} {count === 1 ? "message" : "messages"}) with timestamps and sources.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="email"
          required
          placeholder="to@email.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Textarea
          placeholder="Optional note at the top"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        {!mailConfigured && (
          <p className="text-[11px] leading-5 text-muted-foreground">
            Add <span className="font-mono">RESEND_API_KEY</span> in your environment to send email. You can still download Markdown or HTML.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !to.trim() || !mailConfigured} onClick={() => void send()}>
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

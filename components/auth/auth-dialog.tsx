"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type AuthUser = { id: string; email: string; name: string };

export function AuthDialog({
  open,
  onOpenChange,
  google,
  initialMode = "signin",
  onAuthed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  google: boolean;
  initialMode?: "signin" | "signup";
  onAuthed: (user: AuthUser) => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(google);

  useEffect(() => {
    setGoogleEnabled(google);
  }, [google]);

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open || googleEnabled) return;
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { google?: boolean }) => {
        if (d.google) setGoogleEnabled(true);
      })
      .catch(() => undefined);
  }, [open, googleEnabled]);

  async function submit() {
    setBusy(true);
    try {
      const path = mode === "signup" ? "/api/auth/register" : "/api/auth/login";
      const data = await api<{ user: AuthUser }>(path, {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      onAuthed(data.user);
      onOpenChange(false);
      setPassword("");
      toast.success(mode === "signup" ? "Account created" : "Signed in");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  function googleStart() {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("chaibook_auth_next", sessionStorage.getItem("chaibook_auth_next") || "");
    }
    window.location.href = "/api/auth/google";
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setMode(initialMode);
      }}
    >
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "signup" ? "Create your desk" : "Sign in to your desk"}</DialogTitle>
          <DialogDescription>
            Notebooks stay on your account. Share one by email when you want someone else on it.
          </DialogDescription>
        </DialogHeader>
        {googleEnabled && (
          <>
            <Button type="button" variant="outline" className="w-full" onClick={googleStart}>
              <GoogleMark />
              Continue with Google
            </Button>
            <p className="text-center text-[11px] tracking-wide text-muted-foreground uppercase">or with email</p>
          </>
        )}
        <form
          className="grid gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "signup" && (
            <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            type="password"
            placeholder={mode === "signup" ? "Password (10+ chars, letter + number)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 10 : undefined}
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
          {mode === "signup" && (
            <p className="text-center text-[11px] leading-5 text-muted-foreground">
              By creating a desk you agree to the{" "}
              <a href="/terms" className="font-medium text-chai hover:underline">
                Terms
              </a>{" "}
              and have read the{" "}
              <a href="/privacy" className="font-medium text-chai hover:underline">
                Privacy Policy
              </a>
              .
            </p>
          )}
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {mode === "signup" ? "Already have a desk?" : "New here?"}{" "}
          <button
            type="button"
            className="font-medium text-chai hover:underline"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup" ? "Sign in" : "Create an account"}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

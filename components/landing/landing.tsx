"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { PlusIcon, MenuIcon, LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Notebook } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AuthDialog, type AuthUser } from "@/components/auth/auth-dialog";
import { Hero, Story } from "./story";
import { NotebookDesk } from "./notebook-desk";

const EMOJIS = ["🍵", "📖", "🔬", "🧠", "🎬", "🧭", "🧪", "🌙", "✒️", "🪐"];

const NAV = [
  { href: "#notebooks", label: "Your desk" },
  { href: "#flow", label: "How it works" },
  { href: "#imports", label: "Gmail & Drive" },
  { href: "#privacy", label: "Leave no crumbs" },
  { href: "#guide", label: "How to use" },
  { href: "#faq", label: "FAQ" },
];

export function Landing() {
  const router = useRouter();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🍵");
  const [loading, setLoading] = useState(true);
  const [llm, setLlm] = useState(true);
  const [postgres, setPostgres] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [google, setGoogle] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [scrolled, setScrolled] = useState(false);

  async function load() {
    try {
      const me = await fetch("/api/auth/me").then((r) => r.json()) as { user: AuthUser | null; google?: boolean };
      setUser(me.user);
      setGoogle(Boolean(me.google));
      const health = await api<{ llm: boolean; postgres?: boolean }>("/api/health");
      setLlm(health.llm);
      setPostgres(health.postgres !== false);
      if (!me.user) {
        setNotebooks([]);
        return;
      }
      const data = await api<{ notebooks: Notebook[] }>("/api/notebooks");
      setNotebooks(data.notebooks);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load notebooks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "1") {
      setAuthMode("signin");
      setAuthOpen(true);
    }
    if (params.get("error") === "google") toast.error("Google sign-in did not finish. Try again.");
    if (params.get("auth") || params.get("signed") || params.get("error")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("auth");
      url.searchParams.delete("signed");
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (sessionStorage.getItem("chaibook_auth_next") === "create") {
      sessionStorage.removeItem("chaibook_auth_next");
      setOpen(true);
    }
  }, [user]);

  function requestCreate() {
    if (!user) {
      sessionStorage.setItem("chaibook_auth_next", "create");
      setAuthMode("signin");
      setAuthOpen(true);
      return;
    }
    setOpen(true);
  }

  async function onAuthed(next: AuthUser) {
    setUser(next);
    try {
      const data = await api<{ notebooks: Notebook[] }>("/api/notebooks");
      setNotebooks(data.notebooks);
    } catch {
      /* listed after sign-in */
    }
    if (sessionStorage.getItem("chaibook_auth_next") === "create") {
      sessionStorage.removeItem("chaibook_auth_next");
      setOpen(true);
    }
  }

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    setNotebooks([]);
    toast.success("Signed out");
  }

  async function create() {
    const data = await api<{ notebook: Notebook }>("/api/notebooks", {
      method: "POST",
      body: JSON.stringify({ title: title || "Untitled notebook", description, emoji }),
    });
    setOpen(false);
    setTitle("");
    setDescription("");
    router.push(`/notebooks/${data.notebook.id}`);
  }

  async function remove(id: string) {
    try {
      await api(`/api/notebooks/${id}`, { method: "DELETE" });
      setNotebooks((n) => n.filter((x) => x.id !== id));
      toast.success("Notebook deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete notebook");
      throw err;
    }
  }

  return (
    <div className="landing-page relative min-h-dvh overflow-x-hidden">
      <a
        href="#notebooks"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to your desk
      </a>
      <div className="pointer-events-none absolute inset-0 chai-glow" />
      <div className="pointer-events-none absolute inset-0 chai-grid" />
      <div className="noise absolute inset-0" />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-[18%] size-80 rounded-full bg-chai/20 blur-3xl"
        animate={{ opacity: [0.28, 0.55, 0.28], x: [0, 24, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-40 right-[8%] size-72 rounded-full bg-saffron/15 blur-3xl"
        animate={{ opacity: [0.2, 0.42, 0.2], y: [0, 18, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <header
        className={cn(
          "sticky top-0 z-40 border-b bg-background/75 backdrop-blur-2xl transition-[box-shadow,border-color,background-color] duration-300",
          scrolled ? "landing-header-scrolled border-border" : "border-transparent",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <a href="#top" className="shrink-0" aria-label="ChaiBook LM home">
            <Logo />
          </a>
          <nav className="ml-2 hidden flex-1 items-center justify-center gap-0.5 lg:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            {user ? (
              <>
                <span
                  className="hidden items-center gap-2 rounded-full border border-border/80 bg-card/80 py-0.5 pr-2.5 pl-0.5 sm:inline-flex"
                  title={user.email}
                >
                  <span className="grid size-6 place-items-center rounded-full bg-chai text-[10px] font-semibold text-chai-foreground">
                    {initials(user.name)}
                  </span>
                  <span className="max-w-[9rem] truncate text-sm">{user.name}</span>
                </span>
                <Button variant="ghost" size="sm" className="hidden rounded-full sm:inline-flex" onClick={() => void signOut()}>
                  <LogOutIcon data-icon="inline-start" />
                  Sign out
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                className="hidden rounded-full sm:inline-flex"
                onClick={() => {
                  setAuthMode("signin");
                  setAuthOpen(true);
                }}
              >
                Sign in
              </Button>
            )}
            <Button className="hidden rounded-full sm:inline-flex" onClick={requestCreate}>
              <PlusIcon data-icon="inline-start" />
              New notebook
            </Button>
            <Button className="sm:hidden" size="icon-sm" onClick={requestCreate} aria-label="New notebook">
              <PlusIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu" onClick={() => setMenu(true)}>
              <MenuIcon />
            </Button>
            <Sheet open={menu} onOpenChange={setMenu}>
              <SheetContent side="right" className="w-[min(100%,280px)] p-0">
                <SheetHeader className="border-b border-border px-4 py-4">
                  <SheetTitle className="font-heading text-xl">ChaiBook LM</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 p-3">
                  {NAV.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenu(false)}
                      className="rounded-xl px-3 py-2.5 text-sm hover:bg-secondary"
                    >
                      {item.label}
                    </a>
                  ))}
                  {user && (
                    <Button variant="ghost" className="mt-2" onClick={() => { setMenu(false); void signOut(); }}>
                      <LogOutIcon data-icon="inline-start" />
                      Sign out
                    </Button>
                  )}
                  {!user && (
                    <Button
                      variant="outline"
                      className="mt-2"
                      onClick={() => {
                        setMenu(false);
                        setAuthMode("signin");
                        setAuthOpen(true);
                      }}
                    >
                      Sign in
                    </Button>
                  )}
                  <Link href="/privacy" onClick={() => setMenu(false)} className="rounded-xl px-3 py-2.5 text-sm hover:bg-secondary">
                    Privacy
                  </Link>
                  <Link href="/terms" onClick={() => setMenu(false)} className="rounded-xl px-3 py-2.5 text-sm hover:bg-secondary">
                    Terms
                  </Link>
                  <Button
                    className="mt-3"
                    onClick={() => {
                      setMenu(false);
                      requestCreate();
                    }}
                  >
                    <PlusIcon data-icon="inline-start" />
                    New notebook
                  </Button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main id="top" className="relative mx-auto max-w-6xl px-4 pb-28 sm:px-6">
        <Hero onStart={requestCreate} deskReady={Boolean(user && notebooks.length)} />

        <NotebookDesk
          notebooks={notebooks}
          query={query}
          onQuery={setQuery}
          loading={loading}
          signedIn={Boolean(user)}
          onCreate={requestCreate}
          onReload={() => void load()}
          onRemove={remove}
        />

        {!postgres && (
          <p className="mb-4 rounded-2xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm leading-6">
            The library is offline. Start the database, then refresh.
          </p>
        )}
        {!llm && (
          <p className="mb-4 rounded-2xl border border-chai/25 bg-card/80 px-4 py-3 text-sm leading-6">
            Add an AI key in your environment file to index sources and chat.
          </p>
        )}

        <Story />

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="scroll-mt-24 pt-20"
        >
          <div className="relative overflow-hidden rounded-[2rem] bg-chai px-6 py-14 text-center text-chai-foreground sm:px-12">
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -top-16 left-1/2 size-64 -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="relative font-heading text-3xl text-balance sm:text-5xl"
            >
              Pour a notebook and start asking.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="relative mx-auto mt-4 max-w-lg text-sm leading-7 opacity-90 sm:text-base"
            >
              Add files — or import Gmail, Calendar, and Drive. Ask something you could highlight. When you are done,
              delete the notebook and leave no crumbs.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.98 }}
              className="relative mt-8 inline-flex"
            >
              <Button size="lg" className="h-12 rounded-full bg-background px-6 text-foreground hover:bg-background/90" onClick={requestCreate}>
                <PlusIcon data-icon="inline-start" />
                Create a notebook
              </Button>
            </motion.div>
          </div>
        </motion.section>
      </main>

      <footer className="relative border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Logo />
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Grounded research. Cite, inspect, remember — and wipe clean.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-foreground">
                {item.label}
              </a>
            ))}
            <Link href="/privacy" className="transition hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-8 text-[11px] tracking-wide text-muted-foreground/80 sm:px-6">
          © {new Date().getFullYear()} ChaiBook LM
        </p>
      </footer>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New notebook</DialogTitle>
            <DialogDescription>A private library for one topic. Sources never mix with other notebooks.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={cn(
                  "grid size-10 place-items-center rounded-xl text-lg ring-1 ring-border transition hover:bg-secondary",
                  emoji === e && "bg-secondary ring-chai shadow-[0_8px_20px_-14px_var(--chai)]",
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <Input placeholder="Notebook title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="What is this for?" value={description} onChange={(e) => setDescription(e.target.value)} />
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => void create()}>
              Create notebook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        google={google}
        initialMode={authMode}
        onAuthed={onAuthed}
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  PencilIcon,
  BookOpenIcon,
  MenuIcon,
  LogOutIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Notebook } from "@/lib/types";
import { cn, formatRelative, initials } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AuthDialog, type AuthUser } from "@/components/auth/auth-dialog";
import { Hero, Story } from "./story";

const EMOJIS = ["🍵", "📖", "🔬", "🧠", "🎬", "🧭", "🧪", "🌙", "✒️", "🪐"];

const NAV = [
  { href: "#flow", label: "How it works" },
  { href: "#imports", label: "Gmail & Drive" },
  { href: "#privacy", label: "Leave no crumbs" },
  { href: "#guide", label: "How to use" },
  { href: "#faq", label: "FAQ" },
  { href: "#notebooks", label: "Notebooks" },
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

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return notebooks.filter((n) => !q || n.title.toLowerCase().includes(q) || n.description.toLowerCase().includes(q));
  }, [notebooks, query]);

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
    await fetch("/api/auth/logout", { method: "POST" });
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
    await api(`/api/notebooks/${id}`, { method: "DELETE" });
    setNotebooks((n) => n.filter((x) => x.id !== id));
    toast.success("Notebook deleted");
  }

  return (
    <div className="landing-page relative min-h-dvh overflow-x-hidden">
      <a
        href="#notebooks"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to notebooks
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
        <Hero onStart={requestCreate} />

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

        <section id="notebooks" className="scroll-mt-24 pt-24">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
          >
            <div>
              <p className="text-sm font-medium tracking-[0.18em] text-chai uppercase">Your desk</p>
              <h2 className="mt-2 font-heading text-3xl tracking-tight text-balance sm:text-4xl">Notebooks</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Each notebook is a library on your account. Share one by email and it appears on their desk too.
              </p>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 rounded-full border-border/80 bg-card/80 pl-8 shadow-none"
                placeholder="Search notebooks"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </motion.div>

          {loading ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="surface h-44 animate-pulse rounded-3xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <motion.button
              type="button"
              onClick={requestCreate}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="surface mt-8 flex w-full flex-col items-center justify-center rounded-[1.75rem] border-dashed px-6 py-20 text-center transition hover:border-chai/50 hover:bg-card"
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-chai">
                <BookOpenIcon className="size-7" />
              </span>
              <p className="mt-4 font-heading text-2xl sm:text-3xl">
                {user ? "Start with one notebook" : "Sign in to pour a notebook"}
              </p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {user
                  ? "Add sources, ask a question, and follow the citations."
                  : "Google or email and password. Your library stays on your account."}
              </p>
              <span className="mt-5 inline-flex h-9 items-center rounded-full bg-chai px-4 text-sm font-medium text-chai-foreground">
                {user ? "Create notebook" : "Sign in"}
              </span>
            </motion.button>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((nb, i) => (
                <motion.article
                  key={nb.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.35 }}
                  whileHover={{ y: -5 }}
                  className="surface group relative overflow-hidden rounded-3xl p-5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-chai before:opacity-0 before:transition-opacity group-hover:before:opacity-100"
                >
                  <button type="button" className="absolute inset-0" onClick={() => router.push(`/notebooks/${nb.id}`)} />
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid size-11 place-items-center rounded-2xl bg-secondary text-xl ring-1 ring-border/60">
                      {nb.emoji}
                    </span>
                    <div className="relative z-10 flex gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                      {nb.role !== "collaborator" && (
                        <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Rename ${nb.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = window.prompt("Rename notebook", nb.title);
                          if (!next) return;
                          void api(`/api/notebooks/${nb.id}`, { method: "PATCH", body: JSON.stringify({ title: next }) }).then(load);
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${nb.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete this notebook? Sources, chat, vectors, and memory go with it.")) void remove(nb.id);
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <h3 className="mt-4 font-heading text-2xl leading-tight wrap-break-word">{nb.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{nb.description || "No description yet."}</p>
                  {nb.role === "collaborator" && (
                    <p className="mt-2 inline-flex rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium tracking-wide text-chai uppercase">
                      Shared{nb.ownerName ? ` by ${nb.ownerName}` : ""}
                    </p>
                  )}
                  <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {nb.readyCount ?? 0}/{nb.sourceCount ?? 0} ready
                    </span>
                    <span className="shrink-0">{formatRelative(nb.updatedAt)}</span>
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full bg-chai transition-all", (nb.sourceCount ?? 0) === 0 && "w-0")}
                      style={{
                        width: `${nb.sourceCount ? Math.round(((nb.readyCount ?? 0) / (nb.sourceCount || 1)) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </section>

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

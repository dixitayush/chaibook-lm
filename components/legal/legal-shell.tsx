"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeftIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export const LEGAL_NAV = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

export type LegalSection = {
  id: string;
  kicker?: string;
  title: string;
  body: string[];
};

export function LegalShell({
  eyebrow,
  title,
  lede,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  updated: string;
  sections: LegalSection[];
}) {
  const pathname = usePathname();

  return (
    <div className="landing-page relative min-h-dvh overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 chai-glow" />
      <div className="pointer-events-none absolute inset-0 chai-grid" />
      <div className="noise absolute inset-0" />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-[12%] size-72 rounded-full bg-chai/20 blur-3xl"
        animate={{ opacity: [0.26, 0.5, 0.26], x: [0, 18, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-48 right-[6%] size-64 rounded-full bg-saffron/15 blur-3xl"
        animate={{ opacity: [0.18, 0.4, 0.18], y: [0, 16, 0] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
      />

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="shrink-0" aria-label="ChaiBook LM home">
            <Logo />
          </Link>
          <nav className="ml-auto flex items-center gap-0.5">
            {LEGAL_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px] font-medium transition",
                  pathname === item.href
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to the desk
        </Link>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 text-sm font-medium tracking-[0.18em] text-chai uppercase"
        >
          {eyebrow}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-2 max-w-3xl font-heading text-4xl tracking-tight text-balance sm:text-5xl"
        >
          {title}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base"
        >
          {lede}
        </motion.p>
        <p className="mt-4 text-[11px] tracking-wide text-muted-foreground/80 uppercase">Updated {updated}</p>

        <div className="mt-12 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
          <nav className="hidden lg:block">
            <div className="sticky top-24 space-y-1">
              <p className="mb-3 text-[11px] tracking-[0.16em] text-chai uppercase">On this page</p>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  {s.title}
                </a>
              ))}
            </div>
          </nav>

          <div className="space-y-5">
            {sections.map((section, i) => (
              <motion.article
                key={section.id}
                id={section.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: Math.min(i * 0.03, 0.18) }}
                className="surface scroll-mt-28 relative overflow-hidden rounded-[1.75rem] p-6 sm:p-8"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-4 right-5 font-heading text-5xl text-chai/10"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {section.kicker && (
                  <p className="text-[11px] tracking-[0.14em] text-chai uppercase">{section.kicker}</p>
                )}
                <h2 className="mt-1 font-heading text-2xl tracking-tight sm:text-3xl">{section.title}</h2>
                <div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                  {section.body.map((para) => (
                    <p key={para.slice(0, 48)}>{para}</p>
                  ))}
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </main>

      <footer className="relative border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <Link href="/" className="transition hover:text-foreground">
              Home
            </Link>
            {LEGAL_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-8 text-[11px] tracking-wide text-muted-foreground/80 sm:px-6">
          © {new Date().getFullYear()} ChaiBook LM
        </p>
      </footer>
    </div>
  );
}

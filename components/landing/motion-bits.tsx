"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { MicIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const PIPELINE = ["Ingest", "Index", "Ask", "Cite", "Remember"];

export function RevealLine({ text, delay = 0, inView = false }: { text: string; delay?: number; inView?: boolean }) {
  const words = text.split(" ");
  return (
    <span className="inline">
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          className="inline-block pr-[0.26em] last:pr-0"
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? undefined : { opacity: 1, y: 0 }}
          whileInView={inView ? { opacity: 1, y: 0 } : undefined}
          viewport={inView ? { once: true } : undefined}
          transition={{ delay: delay + i * 0.055, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
        >
          {w}
        </motion.span>
      ))}
    </span>
  );
}

export function SteamWisp({ delay, className }: { delay: number; className?: string }) {
  return (
    <motion.span
      aria-hidden
      className={cn("block h-10 w-px origin-bottom rounded-full bg-chai/50", className)}
      animate={{ y: [10, -22], opacity: [0, 0.55, 0], scaleX: [1, 1.8] }}
      transition={{ duration: 2.8, delay, repeat: Infinity, ease: "easeOut" }}
    />
  );
}

export function PipelineStrip() {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setLit((i) => (i + 1) % PIPELINE.length), 1400);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="mt-8 flex flex-wrap items-center gap-2 sm:gap-3">
      {PIPELINE.map((stage, i) => (
        <div key={stage} className="flex items-center gap-2 sm:gap-3">
          {i > 0 && (
            <span className={cn("hidden h-px w-7 sm:block", i <= lit ? "bg-chai" : "bg-border")} />
          )}
          <motion.span
            animate={i === lit ? { scale: 1.06 } : { scale: 1 }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-[0_10px_30px_-18px_var(--chai)]",
              i === lit ? "border-chai bg-chai text-chai-foreground" : "border-chai/20 bg-card text-chai",
            )}
          >
            {stage}
          </motion.span>
        </div>
      ))}
    </div>
  );
}

export function DeskPreview() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  return (
    <motion.div
      initial={{ opacity: 0, y: 36, rotate: 2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="relative hidden lg:block"
      style={{ perspective: 1100 }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTilt({
          x: ((e.clientY - r.top) / r.height - 0.5) * -9,
          y: ((e.clientX - r.left) / r.width - 0.5) * 12,
        });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <motion.span
        className="absolute -top-3 -right-4 z-10 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium shadow-sm"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="font-mono text-chai">[1]</span> p.3
      </motion.span>
      <motion.span
        className="absolute -bottom-2 -left-3 z-10 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium shadow-sm"
        animate={{ y: [0, 7, 0] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
      >
        t = 1:12
      </motion.span>
      <motion.span
        className="absolute top-1/2 -right-5 z-10 grid size-9 place-items-center rounded-full border border-border bg-card shadow-sm"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      >
        <MicIcon className="size-3.5 text-chai" />
      </motion.span>
      <div className="absolute -inset-8 rounded-[2rem] bg-chai/12 blur-2xl" />
      <motion.div
        animate={{ rotateX: tilt.x, rotateY: tilt.y }}
        transition={{ type: "spring", stiffness: 180, damping: 22 }}
        className="surface relative overflow-hidden rounded-[1.75rem] shadow-[0_40px_80px_-40px_color-mix(in_srgb,var(--chai)_55%,transparent)]"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="size-2 rounded-full bg-chai/80" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="ml-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Notebook desk</span>
        </div>
        <div className="grid grid-cols-[0.72fr_1.2fr_0.78fr] divide-x divide-border">
          <div className="space-y-2 bg-sidebar/80 p-3">
            <p className="text-[10px] font-medium tracking-wide text-chai uppercase">Sources</p>
            {["Inbox · Gmail", "Lecture · YouTube", "Drive notes"].map((name, i) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.12 }}
                className="rounded-xl border border-border bg-card px-2.5 py-2"
              >
                <p className="truncate text-[11px] font-medium">{name}</p>
                <p className="text-[10px] text-chai">{i === 2 ? "Indexing…" : "Ready"}</p>
                {i === 2 && (
                  <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full bg-chai"
                      animate={{ width: ["8%", "92%", "8%"] }}
                      transition={{ duration: 2.4, repeat: Infinity }}
                    />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          <div className="space-y-3 p-3.5">
            <motion.div
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.55 }}
              className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-chai px-3 py-2 text-[13px] leading-5 text-chai-foreground"
            >
              What is the core idea, and where is it stated?
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.95 }}
              className="rounded-2xl rounded-tl-md border border-border bg-background px-3 py-2.5 text-[13px] leading-5"
            >
              Attention lets the model weigh every token at once — stated in the opening of §3.
              <motion.span
                className="ml-1 inline-flex -translate-y-px rounded-md bg-chai/15 px-1.5 font-mono text-[10px] font-semibold text-chai"
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, delay: 1.4 }}
              >
                1
              </motion.span>
              <span className="chat-caret ml-0.5" />
              <div className="mt-2">
                <span className="rounded-lg border border-border bg-secondary px-2 py-1 text-[10px]">
                  <span className="font-mono text-chai">1</span> Attention Is All You Need · p.3
                </span>
              </div>
            </motion.div>
          </div>
          <div className="space-y-2 bg-sidebar/80 p-3">
            <p className="text-[10px] font-medium tracking-wide text-chai uppercase">Studio</p>
            {["Podcast", "Explainer", "Roadmap"].map((name, i) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.12 }}
                className="rounded-xl border border-border bg-card px-2.5 py-2 text-[11px] font-medium"
              >
                {name}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

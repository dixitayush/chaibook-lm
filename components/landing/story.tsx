"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  FileTextIcon,
  GlobeIcon,
  ClapperboardIcon,
  CaptionsIcon,
  StickyNoteIcon,
  MailIcon,
  CalendarIcon,
  FolderIcon,
  PlugIcon,
  MessageSquareIcon,
  BrainIcon,
  HeadphonesIcon,
  MapIcon,
  LayersIcon,
  PinIcon,
  EyeIcon,
  MicIcon,
  SparklesIcon,
  GraduationCapIcon,
  FlaskConicalIcon,
  BriefcaseIcon,
  LibraryIcon,
  Volume2Icon,
  ChevronDownIcon,
  PlusIcon,
  ArrowRightIcon,
  BookMarkedIcon,
  HourglassIcon,
  MousePointerClickIcon,
  InboxIcon,
  EraserIcon,
  BookXIcon,
  WindIcon,
  SmartphoneIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DeskPreview, PipelineStrip, RevealLine, SteamWisp } from "./motion-bits";

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" as const },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

const FLOW = [
  {
    icon: BookMarkedIcon,
    title: "Open one notebook",
    cue: "One topic, one library",
    body: "A course, a paper, and a side project stay apart. Sources never leak into another notebook.",
  },
  {
    icon: HourglassIcon,
    title: "Pour sources in",
    cue: "Wait until Ready",
    body: "PDFs, websites, YouTube, notes — plus Gmail, Calendar, and Drive. Chat unlocks when the first source is Ready, or when you connect a tool.",
  },
  {
    icon: MessageSquareIcon,
    title: "Ask something you could highlight",
    cue: "Point, don’t vacuum",
    body: "Type, or hold the mic. “Where is X defined?” beats “summarize everything.” Answers stream with citations.",
  },
  {
    icon: MousePointerClickIcon,
    title: "Open the passage",
    cue: "Tap [n]",
    body: "A PDF jumps to the page. A video starts at the timestamp. A note highlights the excerpt. Two or three sources show under the reply — the rest still inform the writing.",
  },
  {
    icon: MicIcon,
    title: "Speak and listen",
    cue: "The desk has a voice",
    body: "The mic fills the composer. The speaker writes a spoken summary — it does not read the page aloud.",
  },
  {
    icon: LayersIcon,
    title: "Study, then pin",
    cue: "Studio + memory",
    body: "Turn the same corpus into a podcast, roadmap, flashcards, FAQ, or briefing. Pin a fact so the next question does not forget it.",
  },
];

const SOURCES = [
  { icon: FileTextIcon, title: "PDFs", hint: "Opens on the cited page" },
  { icon: GlobeIcon, title: "Websites", hint: "Paste a public URL" },
  { icon: ClapperboardIcon, title: "YouTube", hint: "Plays from the timestamp" },
  { icon: CaptionsIcon, title: "Captions", hint: "VTT or SRT transcripts" },
  { icon: StickyNoteIcon, title: "Notes", hint: "Paste text any time" },
  { icon: MailIcon, title: "Email", hint: "Paste, .eml, or Gmail" },
  { icon: CalendarIcon, title: "Calendar", hint: ".ics or Google Calendar" },
  { icon: FolderIcon, title: "Drive", hint: "Tick the files you want" },
  { icon: PlugIcon, title: "MCP tools", hint: "GitHub, Jira, Postgres" },
];

const SOURCE_LEAN = [-2.4, 1.8, -1.1, 2.2, -1.6, 0.8, -2, 1.4, -0.6];

const GOOGLE = [
  { icon: InboxIcon, title: "Gmail", body: "Pick threads. Marketing chrome is stripped so the model reads the letter." },
  { icon: CalendarIcon, title: "Calendar", body: "Events land as a readable source — who, when, and what was on the docket." },
  { icon: FolderIcon, title: "Drive", body: "Walk a folder. Check Docs, Sheets, Slides, PDFs. Nothing else walks in." },
];

const WIPE = [
  {
    icon: EraserIcon,
    title: "Delete a source",
    crumb: "The leaf leaves the cup",
    body: "Its vectors, tagged memory, and graph nodes go with it. Empty the cupboard and Studio artifacts leave too.",
  },
  {
    icon: WindIcon,
    title: "Clear a chat",
    crumb: "The steam forgets the kettle",
    body: "The thread, episodes, graph, and Studio vanish. Sources and facts you pinned stay on the desk.",
  },
  {
    icon: BookXIcon,
    title: "Delete a notebook",
    crumb: "The cupboard is empty",
    body: "Files, chat, chunks, memory, Studio, and Mem0 records scoped to it — the whole library leaves.",
  },
];

const USE_CASES = [
  {
    icon: GraduationCapIcon,
    title: "Exam prep",
    eyebrow: "Students",
    body: "Drop lecture PDFs and a playlist. Ask for definitions, generate flashcards, then play the podcast on a commute.",
  },
  {
    icon: FlaskConicalIcon,
    title: "Reading a paper",
    eyebrow: "Researchers",
    body: "Load the PDF and related pages. Ask where a claim is stated, jump to the page, pin the result for the next meeting.",
  },
  {
    icon: LibraryIcon,
    title: "A YouTube course",
    eyebrow: "Self-learners",
    body: "Paste a playlist. A roadmap walks concepts in order — click a node and the clip plays from the cited moment.",
  },
  {
    icon: BriefcaseIcon,
    title: "A briefing, not a guess",
    eyebrow: "Teams",
    body: "Pull Gmail, calendar, Drive, and notes. Ask for a synthesis or generate a briefing you can send — every claim still has a source.",
  },
];

const FAQ = [
  {
    q: "Will it invent facts?",
    a: "It is instructed to stay inside your sources and to refuse when they do not cover the question. Always open a citation if the claim matters. The model can still be wrong; the viewer is there so you can check.",
  },
  {
    q: "What happens when I delete a source, a chat, or a notebook?",
    a: "Delete a source and its indexed vectors plus tagged memory leave. Remove every source and Studio artifacts go too. Clear chat and the thread, episode vectors, chat memory, knowledge graph, and Studio artifacts leave — pinned facts and sources stay. Delete a notebook and the whole cupboard goes: files, chat, chunks, memory, Studio, and Mem0 records scoped to it.",
  },
  {
    q: "Why do I only see two or three sources under an answer?",
    a: "The reply is written from a wider set of passages. The chips under chat show the strongest two or three unique sources so the desk stays readable. Inline [n] still opens the exact excerpt.",
  },
  {
    q: "Are notebooks private from each other?",
    a: "Yes. Each notebook is its own library, and it belongs to your account. After you sign in with Google or email, you only see your notebooks. Vectors, chat, and memory do not mix across notebooks or across users.",
  },
  {
    q: "Do I need an account?",
    a: "Yes, to create or open a notebook. Create an account with email and password, or continue with Google. If you tap New notebook while signed out, the sign-in screen opens first. You can only delete your own notebooks and chats.",
  },
  {
    q: "Does it work on a phone?",
    a: "Yes. Switch between Sources, Chat, and Studio. On a large screen they sit side by side.",
  },
];

const MARQUEE = [
  "PDFs",
  "YouTube",
  "Websites",
  "Captions",
  "Notes",
  "Gmail",
  "Calendar",
  "Drive",
  "MCP",
  "Wipe on delete",
  "Cited chat",
  "Voice in",
  "Spoken summary",
  "Podcast",
  "Roadmap",
  "Flashcards",
  "Memory",
];

export function Hero({ onStart, deskReady }: { onStart: () => void; deskReady?: boolean }) {
  return (
    <section className="relative pt-12 pb-6 sm:pt-16">
      <div className="pointer-events-none absolute -top-6 left-[12%] hidden sm:block">
        <SteamWisp delay={0} />
        <SteamWisp delay={0.9} className="ml-6" />
        <SteamWisp delay={1.7} className="ml-3" />
      </div>
      <div className="grid items-center gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="outline" className="h-8 gap-1.5 rounded-full border-chai/25 bg-card/70 px-3.5 backdrop-blur-sm">
              <motion.span
                animate={{ rotate: [0, 14, -10, 0], scale: [1, 1.15, 1] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <SparklesIcon className="size-3.5 text-chai" />
              </motion.span>
              Grounded research desk
            </Badge>
          </motion.div>
          <h1 className="mt-5 max-w-3xl font-heading text-[2.55rem] leading-[1.18] text-balance sm:text-6xl lg:text-[3.5rem]">
            <RevealLine text="Your files," delay={0.08} />
            <br />
            <RevealLine text="a calm desk," delay={0.28} />
            <br />
            <span className="text-chai">
              <RevealLine text="answers you can open." delay={0.48} />
            </span>
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.5 }}
            className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg"
          >
            Pour in PDFs, YouTube, Gmail, Calendar, or Drive. Ask in text or voice. Every claim should open a page or a
            clip. Delete a source, a chat, or a notebook — and its vectors and memory leave with it.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:items-center"
          >
            <Button size="lg" className="h-12 w-full rounded-full px-6 sm:w-auto" onClick={onStart}>
              <PlusIcon data-icon="inline-start" />
              Start a notebook
            </Button>
            <a href={deskReady ? "#notebooks" : "#flow"} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 w-full rounded-full px-6 sm:w-auto")}>
              {deskReady ? "Your desk" : "See the flow"}
              <motion.span
                animate={{ x: [0, 4, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                className="inline-flex"
              >
                <ArrowRightIcon data-icon="inline-end" />
              </motion.span>
            </a>
          </motion.div>
          <dl className="mt-10 grid grid-cols-3 gap-4">
            {[
              { k: "Cited", v: "Answers" },
              { k: "Google", v: "Mail · Cal · Drive" },
              { k: "Wipe", v: "On delete" },
            ].map((s, i) => (
              <motion.div
                key={s.k}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.05 + i * 0.1, duration: 0.45 }}
                whileHover={{ y: -4, scale: 1.03 }}
                className="rounded-2xl border border-border/80 bg-card/50 px-3 py-3 backdrop-blur-sm"
              >
                <dt className="font-heading text-xl leading-none text-chai sm:text-2xl">{s.k}</dt>
                <dd className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">{s.v}</dd>
              </motion.div>
            ))}
          </dl>
        </div>
        <DeskPreview />
      </div>
      <div className="landing-marquee mt-14 overflow-hidden py-3">
        <div className="landing-marquee-track gap-3 pr-3">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="rounded-full border border-border bg-card/80 px-4 py-1.5 text-sm text-muted-foreground whitespace-nowrap"
            >
              <span className="mr-2 text-chai">●</span>
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Story() {
  return (
    <>
      <section id="flow" className="scroll-mt-24 pt-8">
        <span id="guide" className="sr-only">
          How to use
        </span>
        <Kicker title="How it works" heading="Six moves from a pile of files to a cited answer." />
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          The stage plays the desk in order — hover or tap a step to stay with it.
        </p>
        <PipelineStrip />
        <FlowStage />
      </section>

      <section id="sources" className="scroll-mt-24 pt-24">
        <Kicker title="Sources" heading="Bring in whatever you are actually studying." />
        <div className="mt-8 flex flex-wrap justify-center gap-2.5 sm:gap-3">
          {SOURCES.map((s, i) => (
            <motion.article
              key={s.title}
              initial={{ opacity: 0, y: 14, rotate: SOURCE_LEAN[i] }}
              whileInView={{ opacity: 1, y: 0, rotate: SOURCE_LEAN[i] }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 280, damping: 22 }}
              whileHover={{ y: -7, rotate: 0, scale: 1.05 }}
              className="flex items-center gap-2.5 rounded-full border border-border/80 bg-card/75 py-2 pr-4 pl-2 shadow-[0_12px_28px_-20px_color-mix(in_srgb,var(--chai)_40%,transparent)] backdrop-blur-sm"
            >
              <motion.span
                className="grid size-8 place-items-center rounded-full bg-secondary text-chai"
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 2.4 + i * 0.18, repeat: Infinity, ease: "easeInOut" }}
              >
                <s.icon className="size-3.5" />
              </motion.span>
              <span>
                <span className="block font-heading text-sm leading-none">{s.title}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{s.hint}</span>
              </span>
            </motion.article>
          ))}
        </div>

        <motion.div
          id="imports"
          {...fadeUp}
          className="surface relative mt-8 overflow-hidden rounded-[1.85rem] p-5 sm:p-7"
        >
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -top-16 right-0 size-48 rounded-full bg-chai/18 blur-3xl"
            animate={{ opacity: [0.35, 0.7, 0.35], scale: [1, 1.12, 1] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium tracking-[0.16em] text-chai uppercase">From the rest of your desk</p>
              <h3 className="mt-1 font-heading text-2xl sm:text-3xl">One Google connection. Three doors.</h3>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                What you pick becomes a source in this notebook — and leaves when you delete it. Paste and .eml / .ics
                still work without connecting.
              </p>
            </div>
          </div>
          <div className="relative mt-6 grid gap-4 sm:grid-cols-3">
            {GOOGLE.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.08 }}
                className="relative"
              >
                {i < GOOGLE.length - 1 && (
                  <span className="pointer-events-none absolute top-5 right-[-0.6rem] z-10 hidden h-px w-3 bg-chai/40 sm:block" />
                )}
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-chai text-chai-foreground shadow-[0_16px_32px_-18px_var(--chai)]">
                    <item.icon className="size-4" />
                  </span>
                  <div>
                    <p className="font-heading text-xl leading-tight">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      <section id="desk" className="scroll-mt-24 pt-24">
        <span id="features" className="sr-only">
          Features
        </span>
        <Kicker title="Inside a notebook" heading="The desk, not a chatbot in a void." />
        <DeskBento />
      </section>

      <section id="use-cases" className="scroll-mt-24 pt-24">
        <Kicker title="Who it’s for" heading="Built for studying, not browsing." />
        <AudienceStage />
      </section>

      <section id="privacy" className="scroll-mt-24 pt-24">
        <Kicker title="Leave no crumbs" heading="Delete the cup, the tea leaves go with it." />
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Memory is notebook-scoped on purpose. When you throw something away, ChaiBook does not keep a quiet copy of
          the embeddings underneath.
        </p>
        <WipeRitual />
      </section>

      <Faq />
    </>
  );
}

function FlowStage() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const item = FLOW[active];
  const Icon = item.icon;

  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setActive((i) => (i + 1) % FLOW.length), 4200);
    return () => window.clearInterval(t);
  }, [paused]);

  return (
    <motion.div
      {...fadeUp}
      className="mt-10 grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-stretch"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative min-h-[420px] overflow-hidden rounded-[1.85rem] border border-border bg-card shadow-[0_40px_80px_-48px_color-mix(in_srgb,var(--chai)_50%,transparent)]">
        <div className="pointer-events-none absolute inset-0 chai-glow opacity-70" />
        <div className="absolute inset-x-0 top-0 h-1 bg-muted">
          <motion.div
            className="h-full bg-chai"
            animate={{ width: `${((active + 1) / FLOW.length) * 100}%` }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <div className="relative flex h-full flex-col p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full border border-chai/25 bg-secondary/80 px-3 py-1 text-[11px] font-medium tracking-wide text-chai uppercase">
              {item.cue}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {String(active + 1).padStart(2, "0")} / {String(FLOW.length).padStart(2, "0")}
              {paused ? " · paused" : ""}
            </span>
          </div>
          <div className="relative mt-6 min-h-[200px] flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -14, filter: "blur(8px)" }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0"
              >
                <GuideScene index={active} />
              </motion.div>
            </AnimatePresence>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={`copy-${active}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32 }}
              className="mt-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-2xl bg-chai text-chai-foreground">
                  <Icon className="size-4" />
                </span>
                <h3 className="font-heading text-2xl leading-tight sm:text-3xl">{item.title}</h3>
              </div>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{item.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <ol className="relative flex flex-col gap-1.5">
        {FLOW.map((step, i) => {
          const StepIcon = step.icon;
          const on = i === active;
          return (
            <li key={step.title}>
              <button
                type="button"
                onClick={() => setActive(i)}
                onFocus={() => setPaused(true)}
                className={cn(
                  "relative flex w-full items-start gap-3 overflow-hidden rounded-2xl px-3.5 py-3.5 text-left transition",
                  on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {on && (
                  <motion.span
                    layoutId="guide-active"
                    className="absolute inset-0 rounded-2xl bg-card ring-1 ring-chai/35"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span
                  className={cn(
                    "relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl text-[11px] font-semibold",
                    on ? "bg-chai text-chai-foreground" : "bg-secondary text-chai",
                  )}
                >
                  {on ? <StepIcon className="size-3.5" /> : String(i + 1).padStart(2, "0")}
                </span>
                <span className="relative min-w-0">
                  <span className="block font-heading text-lg leading-tight">{step.title}</span>
                  <span className="mt-0.5 block text-[11px] tracking-wide text-chai uppercase">{step.cue}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}

function GuideScene({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="flex h-full items-center justify-center gap-4">
        <motion.div
          initial={{ rotate: -8, x: -12 }}
          animate={{ rotate: -4, x: 0 }}
          className="w-40 rounded-2xl border border-chai/40 bg-background p-3 shadow-lg"
        >
          <p className="text-[10px] text-chai uppercase">This desk</p>
          <p className="mt-1 font-heading text-lg">Linear algebra</p>
          <p className="mt-2 text-[11px] text-muted-foreground">3 sources · Ready</p>
        </motion.div>
        <motion.div
          initial={{ rotate: 10, x: 16, opacity: 0.4 }}
          animate={{ rotate: 8, x: 8, opacity: 0.45 }}
          className="relative w-36 rounded-2xl border border-dashed border-border bg-muted/40 p-3"
        >
          <span className="absolute inset-x-4 top-1/2 h-px -rotate-12 bg-destructive/50" />
          <p className="text-[10px] uppercase">Other notebook</p>
          <p className="mt-1 font-heading text-base">Groceries</p>
          <p className="mt-2 text-[11px] text-muted-foreground">Stays out</p>
        </motion.div>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center justify-between text-sm">
            <span>Lecture notes.pdf</span>
            <motion.span
              className="text-[11px] font-medium text-chai"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              Indexing
            </motion.span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-chai"
              initial={{ width: "8%" }}
              animate={{ width: ["12%", "100%"] }}
              transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.6 }}
            />
          </div>
          <motion.p
            className="mt-3 text-xs text-muted-foreground"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Chat unlocks when this says Ready.
          </motion.p>
        </div>
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <motion.p
          initial={{ opacity: 0.35 }}
          animate={{ opacity: 0.4 }}
          className="text-sm text-muted-foreground line-through"
        >
          Summarize everything
        </motion.p>
        <motion.div
          initial={{ scale: 0.96 }}
          animate={{ scale: 1 }}
          className="rounded-2xl bg-chai px-4 py-3 text-sm leading-6 text-chai-foreground shadow-[0_18px_40px_-20px_var(--chai)]"
        >
          Where is attention defined in §3?
        </motion.div>
      </div>
    );
  }
  if (index === 3) {
    return (
      <div className="flex h-full items-center justify-center gap-4">
        <motion.span
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="rounded-md bg-chai/15 px-2 py-0.5 font-mono text-sm font-semibold text-chai ring-1 ring-chai/25"
        >
          1
        </motion.span>
        <div className="w-48 overflow-hidden rounded-xl border border-border bg-background">
          <div className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">PDF · p.3</div>
          <div className="space-y-1.5 p-2">
            <div className="h-1.5 w-full rounded bg-muted" />
            <motion.div
              className="h-6 rounded bg-saffron/25 ring-1 ring-saffron/40"
              animate={{ x: [0, 4, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <div className="h-1.5 w-4/5 rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }
  if (index === 4) {
    return (
      <div className="flex h-full items-center justify-center gap-8">
        <motion.span
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="grid size-14 place-items-center rounded-full bg-chai text-chai-foreground shadow-[0_0_0_8px_color-mix(in_srgb,var(--chai)_18%,transparent)]"
        >
          <MicIcon className="size-5" />
        </motion.span>
        <div className="flex h-10 items-end gap-1">
          {[8, 16, 22, 14, 26, 12, 18].map((h, i) => (
            <motion.span
              key={i}
              className="w-1.5 rounded-full bg-chai"
              animate={{ height: [h * 0.4, h, h * 0.5] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.08 }}
            />
          ))}
        </div>
        <motion.span
          animate={{ rotate: [0, -8, 8, 0] }}
          transition={{ duration: 2.2, repeat: Infinity }}
          className="grid size-12 place-items-center rounded-2xl border border-border bg-background"
        >
          <Volume2Icon className="size-5 text-chai" />
        </motion.span>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex gap-3">
        {["Podcast", "Roadmap", "Cards"].map((label, i) => (
          <motion.div
            key={label}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.12, type: "spring", stiffness: 280, damping: 20 }}
            className="w-24 rounded-2xl border border-border bg-background p-3 text-center"
          >
            <span className="mx-auto mb-2 block size-8 rounded-xl bg-secondary" />
            <p className="text-xs font-medium">{label}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function DeskBento() {
  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-3">
      <motion.article
        {...fadeUp}
        whileHover={{ y: -6 }}
        className="surface group relative overflow-hidden rounded-[1.85rem] p-6 sm:p-7 lg:col-span-2"
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-chai/18 blur-3xl"
          animate={{ x: [0, 12, 0], opacity: [0.35, 0.65, 0.35] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
        <p className="relative text-[11px] font-medium tracking-[0.16em] text-chai uppercase">Ask</p>
        <h3 className="relative mt-1 font-heading text-3xl">Cited chat with a voice.</h3>
        <p className="relative mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          Answers come from this notebook. Tap a citation to open the page, clip, or note. Dictate a question; play a
          spoken summary that skips the citation numbers.
        </p>
        <ul className="relative mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { icon: MessageSquareIcon, title: "Cited reply", hint: "Inline [n] chips" },
            { icon: EyeIcon, title: "Source viewer", hint: "PDF, web, or YouTube" },
            { icon: Volume2Icon, title: "Spoken summary", hint: "Listen, don’t recite" },
          ].map((item, i) => (
            <motion.li
              key={item.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.12 + i * 0.08 }}
              className="rounded-2xl bg-secondary/70 px-3.5 py-3"
            >
              <item.icon className="size-4 text-chai" />
              <p className="mt-2 font-heading text-lg leading-tight">{item.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>
            </motion.li>
          ))}
        </ul>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        whileHover={{ y: -6 }}
        className="surface relative overflow-hidden rounded-[1.85rem] p-6"
      >
        <p className="text-[11px] font-medium tracking-[0.16em] text-chai uppercase">Studio</p>
        <h3 className="mt-1 font-heading text-2xl">Study from the same pile.</h3>
        <div className="mt-5 space-y-2.5">
          {[
            { icon: HeadphonesIcon, title: "Podcast", hint: "Aarav & Meera, from this corpus" },
            { icon: MapIcon, title: "Roadmap", hint: "YouTube concepts, timestamped" },
            { icon: LayersIcon, title: "Cards · FAQ · Briefing", hint: "Generated only here" },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, x: 10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/60 px-3 py-2.5"
            >
              <span className="grid size-8 place-items-center rounded-xl bg-secondary text-chai">
                <item.icon className="size-3.5" />
              </span>
              <span>
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="block text-[11px] text-muted-foreground">{item.hint}</span>
              </span>
            </motion.div>
          ))}
        </div>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        whileHover={{ y: -6 }}
        className="surface rounded-[1.85rem] p-6"
      >
        <span className="grid size-10 place-items-center rounded-2xl bg-secondary text-chai">
          <BrainIcon className="size-4" />
        </span>
        <h3 className="mt-4 font-heading text-2xl">Memory that stays in the cup.</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Follow-ups remember the thread. Pin a fact so the next question does not forget what you already established.
        </p>
        <p className="mt-4 flex items-center gap-2 text-xs text-chai">
          <PinIcon className="size-3.5" />
          Notebook-scoped — never mixed
        </p>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        whileHover={{ y: -6 }}
        className="surface rounded-[1.85rem] p-6"
      >
        <span className="grid size-10 place-items-center rounded-2xl bg-secondary text-chai">
          <PlugIcon className="size-4" />
        </span>
        <h3 className="mt-4 font-heading text-2xl">Live tools on the side.</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Connect GitHub, Jira, Postgres, or paste Claude / VS Code MCP JSON. Chat can call them without leaving the
          desk.
        </p>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        whileHover={{ y: -6 }}
        className="surface rounded-[1.85rem] p-6"
      >
        <span className="grid size-10 place-items-center rounded-2xl bg-secondary text-chai">
          <SmartphoneIcon className="size-4" />
        </span>
        <h3 className="mt-4 font-heading text-2xl">Phone or desk.</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          On a phone, switch Sources, Chat, and Studio. On a large screen they sit side by side.
        </p>
      </motion.article>
    </div>
  );
}

function AudienceStage() {
  const [active, setActive] = useState(0);
  const item = USE_CASES[active];
  const Icon = item.icon;

  return (
    <motion.div {...fadeUp} className="mt-8">
      <div className="flex flex-wrap gap-2">
        {USE_CASES.map((u, i) => (
          <button
            key={u.eyebrow}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              i === active ? "bg-chai text-chai-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {u.eyebrow}
          </button>
        ))}
      </div>
      <div className="surface relative mt-5 overflow-hidden rounded-[1.85rem] p-6 sm:p-8">
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-chai/15 blur-2xl"
          animate={{ x: [0, 12, 0], y: [0, 10, 0], opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 opacity-40">
          <span className="absolute inset-y-0 w-16 bg-linear-to-r from-transparent via-chai/15 to-transparent [animation:landing-shine_1.8s_ease]" />
        </span>
        <AnimatePresence mode="wait">
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8"
          >
            <span className="grid size-14 shrink-0 place-items-center rounded-3xl bg-chai text-chai-foreground shadow-[0_16px_32px_-18px_var(--chai)]">
              <Icon className="size-6" />
            </span>
            <div>
              <p className="text-[11px] font-medium tracking-[0.16em] text-chai uppercase">{item.eyebrow}</p>
              <h3 className="mt-1 font-heading text-3xl sm:text-4xl">{item.title}</h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">{item.body}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function WipeRitual() {
  return (
    <div className="relative mt-10">
      <motion.div
        aria-hidden
        className="absolute top-8 right-[8%] left-[8%] hidden h-px bg-linear-to-r from-transparent via-chai/40 to-transparent md:block"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
      <div className="grid gap-8 md:grid-cols-3">
        {WIPE.map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
            className="relative text-center md:px-3"
          >
            <motion.span
              className="mx-auto grid size-14 place-items-center rounded-full border border-chai/25 bg-card text-chai shadow-[0_16px_32px_-20px_var(--chai)]"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3.2 + i * 0.35, repeat: Infinity, ease: "easeInOut" }}
            >
              <item.icon className="size-5" />
            </motion.span>
            <p className="mt-4 text-[11px] tracking-[0.14em] text-chai uppercase">{item.crumb}</p>
            <h3 className="mt-1 font-heading text-xl leading-tight">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Kicker({ title, heading }: { title: string; heading: string }) {
  return (
    <motion.div {...fadeUp}>
      <motion.p
        initial={{ opacity: 0, letterSpacing: "0.4em" }}
        whileInView={{ opacity: 1, letterSpacing: "0.18em" }}
        viewport={{ once: true }}
        className="text-sm font-medium text-chai uppercase"
      >
        {title}
      </motion.p>
      <h2 className="mt-2 max-w-2xl font-heading text-3xl leading-tight text-balance sm:text-4xl lg:text-[2.6rem]">
        <RevealLine text={heading} delay={0.05} inView />
      </h2>
    </motion.div>
  );
}

function Faq() {
  const [open, setOpen] = useState<string | null>(FAQ[0]?.q ?? null);
  return (
    <section id="faq" className="scroll-mt-24 pt-24">
      <Kicker title="FAQ" heading="Straight answers before you pour a notebook." />
      <div className="mt-10 overflow-hidden rounded-3xl border border-border bg-card">
        {FAQ.map((item) => {
          const on = open === item.q;
          return (
            <motion.div
              key={item.q}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="border-b border-border last:border-b-0"
            >
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setOpen(on ? null : item.q)}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
              >
                <span className="font-heading text-lg leading-snug sm:text-xl">{item.q}</span>
                <ChevronDownIcon className={cn("mt-1 size-4 shrink-0 text-chai transition-transform", on && "rotate-180")} />
              </button>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-out",
                  on ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <p className="overflow-hidden px-5 text-sm leading-7 text-muted-foreground sm:px-6">
                  <span className="block pb-5">{item.a}</span>
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

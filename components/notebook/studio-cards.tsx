"use client";

import { BookIcon, HeadphonesIcon, HelpCircleIcon, LayersIcon, MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StudioKind = "podcast" | "roadmap" | "guide" | "faq" | "cards";

export const STUDIO_CARDS: {
  kind: StudioKind;
  icon: typeof HeadphonesIcon;
  label: string;
  hint: string;
  needsYoutube?: boolean;
}[] = [
  { kind: "podcast", icon: HeadphonesIcon, label: "Podcast", hint: "Aarav + Meera" },
  { kind: "roadmap", icon: MapIcon, label: "Roadmap", hint: "From your videos", needsYoutube: true },
  { kind: "guide", icon: BookIcon, label: "Briefing", hint: "Study guide" },
  { kind: "faq", icon: HelpCircleIcon, label: "FAQ", hint: "Cited Q&A" },
  { kind: "cards", icon: LayersIcon, label: "Flashcards", hint: "Quiz yourself" },
];

export function StudioCards({
  busy,
  hasYoutube,
  disabled,
  onGenerate,
  layout = "grid",
}: {
  busy: string | null;
  hasYoutube: boolean;
  disabled?: boolean;
  onGenerate: (kind: StudioKind) => void;
  layout?: "grid" | "row";
}) {
  return (
    <div
      className={cn(
        layout === "row"
          ? "flex gap-3 overflow-x-auto pb-1"
          : "grid grid-cols-2 gap-3 sm:grid-cols-3",
      )}
    >
      {STUDIO_CARDS.map((card) => {
        const Icon = card.icon;
        const blocked = Boolean(disabled || busy);
        const hint = card.needsYoutube && !hasYoutube ? "Needs YouTube" : card.hint;
        return (
          <button
            key={card.kind}
            type="button"
            onClick={() => onGenerate(card.kind)}
            disabled={blocked}
            className={cn(
              "surface rounded-2xl text-left transition hover:border-chai/45 hover:shadow-[0_18px_40px_-28px_color-mix(in_srgb,var(--chai)_45%,transparent)] disabled:opacity-55",
              layout === "row" ? "min-w-[9.5rem] shrink-0 px-3.5 py-3" : "p-3.5",
            )}
          >
            <span className="grid size-8 place-items-center rounded-xl bg-secondary">
              <Icon className="size-4 text-chai" />
            </span>
            <p className="mt-2 text-sm font-medium">{card.label}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              {busy === card.kind ? "Brewing…" : hint}
            </p>
          </button>
        );
      })}
    </div>
  );
}

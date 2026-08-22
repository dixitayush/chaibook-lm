import { cn } from "@/lib/utils";

export function Logo({ className, markOnly }: { className?: string; markOnly?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative grid size-8 place-items-center rounded-xl bg-chai text-chai-foreground shadow-[0_10px_28px_-12px_#a376a2]">
        <svg viewBox="0 0 32 32" className="size-5" fill="none" aria-hidden>
          <path
            d="M7 14c0-4 3.2-7 9-7s9 3 9 7v6.5c0 2.4-2.8 4.5-9 4.5s-9-2.1-9-4.5V14Z"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path d="M25 15.5c2.4.4 3.6 1.8 3.6 3.4S27.4 22 25 22" stroke="currentColor" strokeWidth="1.7" />
          <path d="M11 11.2c.4-2.4 1.6-4 3.4-4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M16 9.4c.3-2 1.2-3.4 2.6-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="absolute -top-1 left-1/2 h-2 w-px origin-bottom -translate-x-1/2 rounded-full bg-saffron/80 animate-steam" />
      </span>
      {!markOnly && (
        <span className="font-heading text-lg leading-none tracking-tight text-foreground">
          ChaiBook <span className="text-chai">LM</span>
        </span>
      )}
    </span>
  );
}

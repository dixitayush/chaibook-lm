import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="relative grid min-h-dvh place-items-center px-6">
      <div className="pointer-events-none absolute inset-0 chai-glow" />
      <div className="relative text-center">
        <Logo className="justify-center" />
        <h1 className="mt-6 font-heading text-4xl">This page steeped away</h1>
        <p className="mt-2 text-muted-foreground">The notebook or route does not exist.</p>
        <Link href="/" className={cn(buttonVariants(), "mt-6 inline-flex")}>
          Back to notebooks
        </Link>
      </div>
    </div>
  );
}

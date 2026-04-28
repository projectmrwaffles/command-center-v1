import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHero({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "ds-hero-gradient overflow-hidden rounded-[28px] border border-border/80 text-text shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PageHeroStat({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/75 bg-panel p-4 text-text shadow-[var(--shadow-panel-soft)]", className)}>
      {children}
    </div>
  );
}

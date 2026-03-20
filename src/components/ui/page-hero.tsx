import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHero({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_10px_28px_rgba(24,24,27,0.05)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PageHeroStat({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_6px_18px_rgba(24,24,27,0.04)]", className)}>
      {children}
    </div>
  );
}

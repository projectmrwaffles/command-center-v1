import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHero({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[28px] border border-red-100/80 bg-[radial-gradient(circle_at_top_left,rgba(254,226,226,0.9),rgba(255,255,255,0.96)_34%,rgba(255,237,213,0.88)_66%,rgba(255,247,237,0.9)_100%)] shadow-[0_20px_60px_rgba(239,68,68,0.10)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PageHeroStat({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-white/85 p-4 shadow-[0_8px_24px_rgba(239,68,68,0.08)] backdrop-blur", className)}>
      {children}
    </div>
  );
}

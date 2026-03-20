import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHero({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[28px] border border-orange-100/70 bg-[linear-gradient(180deg,rgba(255,251,247,0.98)_0%,rgba(255,255,255,0.98)_52%,rgba(255,247,237,0.9)_100%)] shadow-[0_16px_42px_rgba(24,24,27,0.06)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PageHeroStat({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/80 bg-white/88 p-4 shadow-[0_8px_22px_rgba(24,24,27,0.05)] backdrop-blur-sm", className)}>
      {children}
    </div>
  );
}

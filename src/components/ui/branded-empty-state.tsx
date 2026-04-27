import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BrandedEmptyState({ icon, title, description, action, className }: { icon: ReactNode; title: string; description: string; action?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border bg-panel px-6 py-16 text-center text-text shadow-[var(--shadow-panel-soft)]",
        className,
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-accent/15 bg-accent-soft text-accent shadow-[var(--shadow-panel-soft)]">{icon}</div>
      <p className="text-xl font-semibold tracking-tight text-text">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

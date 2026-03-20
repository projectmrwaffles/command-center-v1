import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BrandedEmptyState({ icon, title, description, action, className }: { icon: ReactNode; title: string; description: string; action?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[28px] border border-dashed border-red-200 bg-[radial-gradient(circle_at_top,rgba(254,226,226,0.75),rgba(255,255,255,0.96)_55%,rgba(255,237,213,0.7)_100%)] px-6 py-16 text-center shadow-sm",
        className,
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 shadow-inner">{icon}</div>
      <p className="text-xl font-semibold tracking-tight text-zinc-900">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BrandedEmptyState({ icon, title, description, action, className }: { icon: ReactNode; title: string; description: string; action?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[28px] border border-dashed border-orange-200/80 bg-[linear-gradient(180deg,rgba(255,250,245,0.98)_0%,rgba(255,255,255,0.98)_58%,rgba(255,247,237,0.88)_100%)] px-6 py-16 text-center shadow-[0_10px_28px_rgba(24,24,27,0.04)]",
        className,
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-orange-100/80 bg-orange-50/80 text-orange-700 shadow-inner shadow-orange-100/40">{icon}</div>
      <p className="text-xl font-semibold tracking-tight text-zinc-900">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

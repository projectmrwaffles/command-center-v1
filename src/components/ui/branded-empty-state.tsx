import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BrandedEmptyState({ icon, title, description, action, className }: { icon: ReactNode; title: string; description: string; action?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[28px] border border-dashed border-zinc-200 bg-white px-6 py-16 text-center shadow-[0_8px_24px_rgba(24,24,27,0.04)]",
        className,
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 shadow-[0_4px_12px_rgba(24,24,27,0.04)]">{icon}</div>
      <p className="text-xl font-semibold tracking-tight text-zinc-900">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

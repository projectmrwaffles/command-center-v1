import { cn } from "@/lib/utils";
import { formatProjectTypeLabel, getProjectStatusTone, getProjectTypeTone } from "@/lib/project-ui";

export function ProjectStatusBadge({ status, className }: { status?: string | null; className?: string }) {
  const tone = getProjectStatusTone(status);

  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium", tone.badge, className)}>
      <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
      {tone.label}
    </span>
  );
}

export function ProjectTypeBadge({ type, status, className }: { type?: string | null; status?: string | null; className?: string }) {
  const statusTone = getProjectStatusTone(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em]",
        getProjectTypeTone(type),
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full opacity-80", statusTone.dot)} />
      {formatProjectTypeLabel(type)}
    </span>
  );
}

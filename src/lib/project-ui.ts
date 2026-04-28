import { legacyTypeToLabel } from "@/lib/project-intake";

export type ProjectStatusTone = {
  badge: string;
  dot: string;
  progress: string;
  progressTrack: string;
  surface: string;
  pill: string;
  label: string;
};

const DEFAULT_STATUS_TONE: ProjectStatusTone = {
  badge: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200",
  dot: "bg-red-500",
  progress: "bg-red-500",
  progressTrack: "bg-red-100 dark:bg-red-950/50",
  surface: "border-red-200/70 bg-panel dark:border-red-900/50",
  pill: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200",
  label: "Active",
};

export function getProjectStatusTone(status?: string | null): ProjectStatusTone {
  switch ((status || "active").toLowerCase()) {
    case "completed":
      return {
        badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
        dot: "bg-emerald-500",
        progress: "bg-emerald-500",
        progressTrack: "bg-emerald-100 dark:bg-emerald-950/50",
        surface: "border-emerald-200/70 bg-panel dark:border-emerald-900/50",
        pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
        label: "Completed",
      };
    case "blocked":
    case "paused":
      return {
        badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
        dot: "bg-amber-500",
        progress: "bg-amber-500",
        progressTrack: "bg-amber-100 dark:bg-amber-950/50",
        surface: "border-amber-200/70 bg-panel dark:border-amber-900/50",
        pill: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
        label: status?.toLowerCase() === "paused" ? "Paused" : "Blocked",
      };
    case "archived":
      return {
        badge: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300",
        dot: "bg-slate-400",
        progress: "bg-slate-500",
        progressTrack: "bg-slate-200 dark:bg-slate-700",
        surface: "border-slate-200 bg-panel dark:border-slate-700",
        pill: "bg-slate-100 text-slate-600 dark:bg-slate-900/70 dark:text-slate-300",
        label: "Archived",
      };
    default:
      return DEFAULT_STATUS_TONE;
  }
}

export function getProjectTypeTone(type?: string | null) {
  switch ((type || "other").toLowerCase()) {
    case "marketing":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200";
    case "product":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200";
    case "engineering":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
    case "operations":
      return "border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-800 dark:bg-stone-950/40 dark:text-stone-200";
    default:
      return "border-border bg-panel-elevated text-text-secondary";
  }
}

export function formatProjectTypeLabel(type?: string | null) {
  return legacyTypeToLabel(type || "other");
}

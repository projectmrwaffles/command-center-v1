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
  badge: "border-orange-200 bg-orange-50 text-orange-700",
  dot: "bg-orange-500",
  progress: "bg-orange-500",
  progressTrack: "bg-orange-100",
  surface: "border-orange-200/70 bg-white",
  pill: "bg-orange-50 text-orange-700",
  label: "Active",
};

export function getProjectStatusTone(status?: string | null): ProjectStatusTone {
  switch ((status || "active").toLowerCase()) {
    case "completed":
      return {
        badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
        dot: "bg-emerald-500",
        progress: "bg-emerald-500",
        progressTrack: "bg-emerald-100",
        surface: "border-emerald-200/70 bg-white",
        pill: "bg-emerald-50 text-emerald-700",
        label: "Completed",
      };
    case "blocked":
    case "paused":
      return {
        badge: "border-amber-200 bg-amber-50 text-amber-700",
        dot: "bg-amber-500",
        progress: "bg-amber-500",
        progressTrack: "bg-amber-100",
        surface: "border-amber-200/70 bg-white",
        pill: "bg-amber-50 text-amber-700",
        label: status?.toLowerCase() === "paused" ? "Paused" : "Blocked",
      };
    case "archived":
      return {
        badge: "border-slate-200 bg-slate-100 text-slate-600",
        dot: "bg-slate-400",
        progress: "bg-slate-500",
        progressTrack: "bg-slate-200",
        surface: "border-slate-200 bg-white",
        pill: "bg-slate-100 text-slate-600",
        label: "Archived",
      };
    default:
      return DEFAULT_STATUS_TONE;
  }
}

export function getProjectTypeTone(type?: string | null) {
  switch ((type || "other").toLowerCase()) {
    case "marketing":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "product":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "engineering":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "operations":
      return "border-stone-200 bg-stone-50 text-stone-700";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }
}

export function formatProjectTypeLabel(type?: string | null) {
  return legacyTypeToLabel(type || "other");
}

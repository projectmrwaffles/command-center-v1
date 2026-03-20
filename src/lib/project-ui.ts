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
  badge: "border-red-200/90 bg-red-50 text-red-700",
  dot: "bg-red-500",
  progress: "from-red-500 via-red-500 to-amber-400",
  progressTrack: "bg-red-100/80",
  surface: "border-red-100/80 bg-gradient-to-br from-red-50 via-white to-orange-50/70",
  pill: "bg-red-100 text-red-700",
  label: "Active",
};

export function getProjectStatusTone(status?: string | null): ProjectStatusTone {
  switch ((status || "active").toLowerCase()) {
    case "completed":
      return {
        badge: "border-emerald-200/90 bg-emerald-50 text-emerald-700",
        dot: "bg-emerald-500",
        progress: "from-emerald-500 via-emerald-400 to-teal-400",
        progressTrack: "bg-emerald-100/80",
        surface: "border-emerald-100/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/70",
        pill: "bg-emerald-100 text-emerald-700",
        label: "Completed",
      };
    case "blocked":
    case "paused":
      return {
        badge: "border-amber-200/90 bg-amber-50 text-amber-700",
        dot: "bg-amber-500",
        progress: "from-amber-500 via-orange-400 to-amber-300",
        progressTrack: "bg-amber-100/80",
        surface: "border-amber-100/80 bg-gradient-to-br from-amber-50 via-white to-orange-50/70",
        pill: "bg-amber-100 text-amber-700",
        label: status?.toLowerCase() === "paused" ? "Paused" : "Blocked",
      };
    case "archived":
      return {
        badge: "border-slate-200/90 bg-slate-100 text-slate-600",
        dot: "bg-slate-400",
        progress: "from-slate-500 via-slate-400 to-slate-300",
        progressTrack: "bg-slate-200/80",
        surface: "border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-slate-100/80",
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
      return "border-red-200/80 bg-red-50 text-red-700";
    case "product":
      return "border-rose-200/80 bg-rose-50 text-rose-700";
    case "engineering":
      return "border-orange-200/80 bg-orange-50 text-orange-700";
    case "operations":
      return "border-amber-200/80 bg-amber-50 text-amber-700";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }
}

export function formatProjectTypeLabel(type?: string | null) {
  return legacyTypeToLabel(type || "other");
}

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
  badge: "border-accent/18 bg-accent-soft text-accent-soft-foreground",
  dot: "bg-accent",
  progress: "bg-accent",
  progressTrack: "bg-accent-soft/75",
  surface: "border-accent/14 bg-panel-subtle",
  pill: "bg-accent-soft text-accent-soft-foreground",
  label: "Active",
};

export function getProjectStatusTone(status?: string | null): ProjectStatusTone {
  switch ((status || "active").toLowerCase()) {
    case "completed":
      return {
        badge: "ds-success",
        dot: "bg-success",
        progress: "bg-success",
        progressTrack: "bg-[color:color-mix(in_srgb,var(--color-success)_14%,white)] dark:bg-[color:color-mix(in_srgb,var(--color-success)_18%,var(--color-panel))]",
        surface: "border-[color:color-mix(in_srgb,var(--color-success)_22%,var(--color-border))] bg-panel",
        pill: "bg-[color:color-mix(in_srgb,var(--color-success)_12%,white)] text-[color:color-mix(in_srgb,var(--color-success)_84%,var(--color-text))]",
        label: "Completed",
      };
    case "blocked":
    case "paused":
      return {
        badge: "ds-warning",
        dot: "bg-warning",
        progress: "bg-warning",
        progressTrack: "bg-[color:color-mix(in_srgb,var(--color-warning)_18%,white)] dark:bg-[color:color-mix(in_srgb,var(--color-warning)_20%,var(--color-panel))]",
        surface: "border-[color:color-mix(in_srgb,var(--color-warning)_24%,var(--color-border))] bg-panel",
        pill: "bg-[color:color-mix(in_srgb,var(--color-warning)_14%,white)] text-[color:color-mix(in_srgb,var(--color-warning)_82%,var(--color-text))]",
        label: status?.toLowerCase() === "paused" ? "Paused" : "Blocked",
      };
    case "archived":
      return {
        badge: "border-border bg-panel-subtle text-text-secondary",
        dot: "bg-text-muted",
        progress: "bg-text-muted",
        progressTrack: "bg-panel-subtle-strong",
        surface: "border-border bg-panel",
        pill: "bg-panel-subtle text-text-secondary",
        label: "Archived",
      };
    default:
      return DEFAULT_STATUS_TONE;
  }
}

export function getProjectTypeTone(type?: string | null) {
  switch ((type || "other").toLowerCase()) {
    case "marketing":
    case "product":
      return "border-accent/16 bg-accent-soft/80 text-accent-soft-foreground";
    case "engineering":
      return "border-[color:color-mix(in_srgb,var(--color-warning)_24%,var(--color-border))] bg-[color:color-mix(in_srgb,var(--color-warning)_12%,white)] text-[color:color-mix(in_srgb,var(--color-warning)_82%,var(--color-text))]";
    case "operations":
    default:
      return "border-border bg-panel-subtle text-text-secondary";
  }
}

export function formatProjectTypeLabel(type?: string | null) {
  return legacyTypeToLabel(type || "other");
}

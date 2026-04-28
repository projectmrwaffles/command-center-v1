import { cn } from "@/lib/utils";

export type ExecutionTone = {
  label: string;
  badgeClassName: string;
  description: string;
};

export function isStaleExecutionTimestamp(value?: string | null, thresholdMs = 60 * 1000) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > thresholdMs;
}

export function formatRelativeTimestamp(value?: string | null) {
  if (!value) return "No recent update";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No recent update";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "Updated just now";
  if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Updated ${diffHours}h ago`;
  if (diffHours < 48) return "Updated yesterday";

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Updated ${diffDays}d ago`;

  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function getExecutionTone(input: {
  status?: string | null;
  reviewRequired?: boolean | null;
  reviewStatus?: string | null;
  blocked?: boolean | null;
  approvalCount?: number | null;
  stale?: boolean | null;
}) {
  const reviewState = input.reviewStatus || null;
  const reviewPending = Boolean(
    input.reviewRequired
    && reviewState
    && reviewState !== "not_requested"
    && reviewState !== "approved"
  );
  const reviewActive = input.status === "review" || reviewState === "in_review" || reviewState === "revision_requested" || reviewState === "in_revision";
  if (input.blocked || input.status === "blocked") {
    return {
      label: "Blocked",
      badgeClassName: "border-accent/20 bg-accent-soft text-accent-soft-foreground",
      description: "Needs attention before work can continue.",
    } satisfies ExecutionTone;
  }

  if ((input.approvalCount ?? 0) > 0) {
    return {
      label: "Needs review",
      badgeClassName: "ds-warning",
      description: "There is at least one pending decision or approval.",
    } satisfies ExecutionTone;
  }

  if (input.status === "done") {
    if (reviewPending) {
      return {
        label: "Awaiting review",
        badgeClassName: "border-accent/18 bg-accent-soft text-accent-soft-foreground",
        description: "Implementation is finished, but review has not cleared yet.",
      } satisfies ExecutionTone;
    }

    return {
      label: "Completed",
      badgeClassName: "ds-success",
      description: "This work is finished with no open review signal.",
    } satisfies ExecutionTone;
  }

  if (reviewActive) {
    return {
      label: reviewState === "revision_requested" || reviewState === "in_revision" ? "In revision" : "In review",
      badgeClassName: "border-accent/18 bg-accent-soft text-accent-soft-foreground",
      description: "Execution is in an active review loop.",
    } satisfies ExecutionTone;
  }

  if (input.status === "in_progress") {
    if (input.stale) {
      return {
        label: "Needs update",
        badgeClassName: "ds-warning",
        description: "Marked in progress, but there has not been a recent execution update.",
      } satisfies ExecutionTone;
    }

    return {
      label: "Executing now",
      badgeClassName: "border-accent/18 bg-accent-soft text-accent-soft-foreground",
      description: "Actively moving with a live in-progress status.",
    } satisfies ExecutionTone;
  }

  if (input.status === "paused") {
    return {
      label: "Paused",
      badgeClassName: "ds-warning",
      description: "Execution is paused right now.",
    } satisfies ExecutionTone;
  }

  if (reviewPending) {
    return {
      label: "Awaiting review",
      badgeClassName: "border-accent/18 bg-accent-soft text-accent-soft-foreground",
      description: "This task is queued behind an outstanding review step.",
    } satisfies ExecutionTone;
  }

  return {
    label: "Queued",
    badgeClassName: "border-border bg-panel-subtle text-text-secondary",
    description: "Not started yet with current project data.",
  } satisfies ExecutionTone;
}

export function ProgressRing({ value, size = 44, strokeWidth = 4, shellClassName }: { value?: number | null; size?: number; strokeWidth?: number; shellClassName?: string }) {
  const normalized = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;

  return (
    <div className={cn("relative inline-flex items-center justify-center", shellClassName)} style={{ width: size, height: size }} aria-label={`Progress ${normalized}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} className="stroke-border/80 dark:stroke-border" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className={cn("stroke-accent transition-all duration-500", normalized === 0 && "stroke-border")}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-[10px] font-semibold tracking-tight text-text-secondary">{normalized}%</span>
    </div>
  );
}

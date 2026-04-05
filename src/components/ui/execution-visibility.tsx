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
  if (input.blocked || input.status === "blocked") {
    return {
      label: "Blocked",
      badgeClassName: "border-red-200 bg-red-50 text-red-700",
      description: "Needs attention before work can continue.",
    } satisfies ExecutionTone;
  }

  if ((input.approvalCount ?? 0) > 0) {
    return {
      label: "Needs review",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
      description: "There is at least one pending decision or approval.",
    } satisfies ExecutionTone;
  }

  if (input.status === "done") {
    if (input.reviewRequired && input.reviewStatus !== "approved") {
      return {
        label: "Awaiting review",
        badgeClassName: "border-purple-200 bg-purple-50 text-purple-700",
        description: "Implementation is finished, but review has not cleared yet.",
      } satisfies ExecutionTone;
    }

    return {
      label: "Completed",
      badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
      description: "This work is finished with no open review signal.",
    } satisfies ExecutionTone;
  }

  if (input.status === "review" || (input.reviewRequired && input.reviewStatus && input.reviewStatus !== "not_requested" && input.reviewStatus !== "approved")) {
    return {
      label: input.reviewStatus === "revision_requested" || input.reviewStatus === "in_revision" ? "In revision" : "In review",
      badgeClassName: "border-purple-200 bg-purple-50 text-purple-700",
      description: "Execution is in a review loop using the current review fields.",
    } satisfies ExecutionTone;
  }

  if (input.status === "in_progress") {
    if (input.stale) {
      return {
        label: "Needs update",
        badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
        description: "Marked in progress, but there has not been a recent execution update.",
      } satisfies ExecutionTone;
    }

    return {
      label: "Executing now",
      badgeClassName: "border-blue-200 bg-blue-50 text-blue-700",
      description: "Actively moving with a live in-progress status.",
    } satisfies ExecutionTone;
  }

  if (input.status === "paused") {
    return {
      label: "Paused",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
      description: "Execution is paused right now.",
    } satisfies ExecutionTone;
  }

  return {
    label: "Queued",
    badgeClassName: "border-zinc-200 bg-zinc-50 text-zinc-700",
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
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} className="stroke-zinc-200" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className={cn("stroke-red-500 transition-all duration-500", normalized === 0 && "stroke-zinc-300")}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-[10px] font-semibold tracking-tight text-zinc-700">{normalized}%</span>
    </div>
  );
}

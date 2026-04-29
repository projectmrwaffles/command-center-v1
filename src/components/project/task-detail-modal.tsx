"use client";

import { X } from "lucide-react";
import { TASK_TYPE_CONFIG, humanizeTaskValue } from "@/lib/task-model";
import { cn } from "@/lib/utils";
import { deriveMilestoneDisplayState } from "@/lib/project-detail-state";

type MilestoneReviewSummary = {
  latestSubmissionStatus?: string | null;
  latestDecision?: string | null;
  latestDecisionNotes?: string | null;
  latestRejectionComment?: string | null;
  latestSubmissionSummary?: string | null;
  latestRevisionNumber?: number | null;
};

type MilestoneLike = {
  id: string;
  name: string;
  approvalGateRequired?: boolean;
  approvalGateStatus?: string | null;
  deliveryReviewRequired?: boolean;
  deliveryReviewStatus?: string | null;
  reviewSummary?: MilestoneReviewSummary | null;
  reviewRequest?: {
    id?: string | null;
    status?: string | null;
    summary?: string | null;
  } | null;
  preBuildCheckpoint?: {
    outcome?: "match" | "mismatch" | "manual_review" | null;
    status?: "approved" | "pending" | "not_requested" | null;
    reasons?: string[] | null;
  } | null;
  totalTasks?: number;
  doneTasks?: number;
};

type TaskLike = {
  id: string;
  title: string;
  status: string;
  description?: string | null;
  updated_at?: string | null;
  sprint_id?: string | null;
  task_type?: string | null;
  task_goal?: string | null;
  task_metadata?: Record<string, string> | null;
  assignee_agent_id?: string | null;
  review_required?: boolean | null;
  review_status?: string | null;
};

type AssigneeLike = {
  name?: string | null;
  title?: string | null;
} | null;

function formatStatusLabel(value?: string | null) {
  if (!value) return "Unknown";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value?: string | null) {
  if (!value) return "No recent update";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getReviewState(task: TaskLike, milestone: MilestoneLike | null) {
  if (!task.review_required) {
    return {
      badge: null,
      title: "Review not required",
      detail: "This task does not require a delivery review handoff.",
      tone: "border-border bg-panel-elevated text-text-secondary",
    };
  }

  const milestoneState = milestone ? deriveMilestoneDisplayState(milestone) : null;
  const stageKey = milestoneState?.stageState.key;
  const taskReviewStatus = task.review_status || "not_requested";

  if (stageKey === "revision_cycle") {
    return {
      badge: milestoneState?.stageState.label || "Revision cycle",
      title: "Revision requested",
      detail: milestone?.reviewRequest?.summary || milestone?.reviewSummary?.latestDecisionNotes || milestone?.reviewSummary?.latestRejectionComment || "Changes were requested on delivered work. Complete the revision, then send it back for review.",
      tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
    };
  }

  if (stageKey === "delivery_review_active" || stageKey === "rereview_active") {
    return {
      badge: milestoneState?.stageState.label || "In review",
      title: stageKey === "rereview_active" ? "Re-review in progress" : "Delivery review in progress",
      detail: milestone?.reviewSummary?.latestSubmissionSummary || "Completed work is with the reviewer right now.",
      tone: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200",
    };
  }

  if (stageKey === "qa_ready" || taskReviewStatus === "requested") {
    return {
      badge: milestoneState?.stageState.label || "Ready for review",
      title: "Ready for delivery review",
      detail: "The work is complete enough to review without relying on the milestone card.",
      tone: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200",
    };
  }

  if (taskReviewStatus === "approved" || stageKey === "iteration_shipped") {
    return {
      badge: milestoneState?.stageState.label || "Approved",
      title: "Review approved",
      detail: milestone?.reviewSummary?.latestDecisionNotes || "This task's delivered work has already been accepted.",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
    };
  }

  if (task.status === "review") {
    return {
      badge: "In review",
      title: "Review in progress",
      detail: "This task is currently in a review step.",
      tone: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200",
    };
  }

  return {
    badge: formatStatusLabel(taskReviewStatus === "not_requested" ? "review pending" : taskReviewStatus),
    title: "Review still ahead",
    detail: "Finish the task work first, then use delivery review as the acceptance surface.",
    tone: "border-border bg-panel-elevated text-text-secondary",
  };
}

function getFollowUpIntentLabel(value?: string | null) {
  switch (value) {
    case "revise_delivered_work":
      return "Revision follow-up";
    case "add_deliverable":
      return "New deliverable";
    case "add_support_work":
      return "Support work";
    default:
      return null;
  }
}

export function TaskDetailModal({
  open,
  onClose,
  task,
  milestone,
  assignee,
}: {
  open: boolean;
  onClose: () => void;
  task: TaskLike | null;
  milestone: MilestoneLike | null;
  assignee: AssigneeLike;
}) {
  if (!open || !task) return null;

  const taskTypeConfig = task.task_type ? TASK_TYPE_CONFIG[task.task_type as keyof typeof TASK_TYPE_CONFIG] : null;
  const reviewState = getReviewState(task, milestone);
  const metadataEntries = taskTypeConfig
    ? taskTypeConfig.metadataFields
        .map((field) => ({
          label: field.label,
          value: task.task_metadata?.[field.key],
        }))
        .filter((entry) => entry.value)
    : [];
  const referenceDocumentTitles = task.task_metadata?.reference_document_titles
    ? String(task.task_metadata.reference_document_titles).split("|").map((value) => value.trim()).filter(Boolean)
    : [];
  const followUpIntentLabel = getFollowUpIntentLabel(task.task_metadata?.follow_up_intent);
  const revisionSourceTitle = task.task_metadata?.revision_source_task_title
    ? String(task.task_metadata.revision_source_task_title).trim()
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-border bg-panel shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-panel/95 px-6 py-5 backdrop-blur">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Task detail</div>
            <h2 className="mt-1 text-xl font-semibold text-text">{task.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span>{taskTypeConfig?.label || "Task"}</span>
              {milestone?.name ? <span>• Stage: {milestone.name}</span> : null}
              <span>• Updated {formatTimestamp(task.updated_at)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-text-muted transition hover:bg-panel-elevated hover:text-text" aria-label="Close task detail modal">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-panel-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">{formatStatusLabel(task.status)}</span>
            {task.review_required ? <span className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]", reviewState.tone)}>{reviewState.badge || "Review required"}</span> : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-panel-elevated px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Type</div>
              <div className="mt-1 text-sm font-medium text-text">{taskTypeConfig?.label || "Unstructured task"}</div>
            </div>
            <div className="rounded-2xl border border-border bg-panel-elevated px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Owner</div>
              <div className="mt-1 text-sm font-medium text-text">{assignee?.name || "Unassigned"}</div>
              {assignee?.title ? <div className="mt-1 text-xs text-text-muted">{assignee.title}</div> : null}
            </div>
            <div className="rounded-2xl border border-border bg-panel-elevated px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Stage</div>
              <div className="mt-1 text-sm font-medium text-text">{milestone?.name || "Not assigned"}</div>
            </div>
            <div className="rounded-2xl border border-border bg-panel-elevated px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Last updated</div>
              <div className="mt-1 text-sm font-medium text-text">{formatTimestamp(task.updated_at)}</div>
            </div>
          </div>

          {task.review_required ? (
            <section className={cn("rounded-3xl border px-5 py-4", reviewState.tone)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-current/20 bg-panel/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">Delivery review</span>
                {reviewState.badge ? <span className="text-xs font-medium">{reviewState.badge}</span> : null}
              </div>
              <h3 className="mt-3 text-sm font-semibold">{reviewState.title}</h3>
              <p className="mt-2 text-sm leading-6">{reviewState.detail}</p>
            </section>
          ) : null}

          <section className="rounded-3xl border border-border bg-panel px-5 py-4">
            <h3 className="text-sm font-semibold text-text">Task summary</h3>
            {task.task_goal ? <p className="mt-2 text-sm font-medium text-text">{task.task_goal}</p> : null}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{task.description || "No task description yet."}</p>
          </section>

          {followUpIntentLabel || revisionSourceTitle || referenceDocumentTitles.length > 0 ? (
            <section className="rounded-3xl border border-border bg-panel-elevated px-5 py-4">
              <h3 className="text-sm font-semibold text-text">Follow-up context</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-panel px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Follow-up mode</div>
                  <div className="mt-1 text-sm font-medium text-text">{followUpIntentLabel || "Standard task"}</div>
                </div>
                {revisionSourceTitle ? (
                  <div className="rounded-2xl border border-border bg-panel px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Revision target</div>
                    <div className="mt-1 text-sm font-medium text-text">{revisionSourceTitle}</div>
                  </div>
                ) : null}
              </div>
              {referenceDocumentTitles.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-border bg-panel px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Reference files</div>
                  <ul className="mt-2 space-y-1 text-sm text-text">
                    {referenceDocumentTitles.map((title) => <li key={title}>• {title}</li>)}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {metadataEntries.length > 0 ? (
            <section className="rounded-3xl border border-border bg-panel-elevated px-5 py-4">
              <h3 className="text-sm font-semibold text-text">Structured context</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {metadataEntries.map((entry) => (
                  <div key={entry.label} className="rounded-2xl border border-border bg-panel px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{entry.label}</div>
                    <div className="mt-1 text-sm font-medium text-text">{humanizeTaskValue(String(entry.value))}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-3xl border border-border bg-panel-elevated px-5 py-4">
            <h3 className="text-sm font-semibold text-text">Notes & history</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">This task was last updated {formatTimestamp(task.updated_at)}. More detailed history can stay in the existing review and activity surfaces for now.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

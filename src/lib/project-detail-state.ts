import { deriveFirstPassQcState, deriveReviewCheckpointState } from "./review-checkpoint-state.ts";

type AttachmentKickoffState = {
  status?: string;
  label?: string;
  detail?: string;
  progressPct?: number;
  active?: boolean;
  error?: string;
  recoverable?: boolean;
  retryable?: boolean;
};

export function shouldShowAttachmentKickoffBanner(attachmentKickoffState?: AttachmentKickoffState | null) {
  return Boolean(
    attachmentKickoffState
    && (
      attachmentKickoffState.active
      || attachmentKickoffState.status === "failed"
      || attachmentKickoffState.status === "retryable_failure"
    )
  );
}

type TruthExecutionState = {
  key: string;
  label: string;
  description: string;
};

type ProjectTruthLike = {
  progressPct?: number;
  headline?: string;
  summary?: string;
  execution?: TruthExecutionState;
} | null | undefined;

export type MilestoneLike = {
  approvalGateStatus?: string | null;
  deliveryReviewStatus?: string | null;
  totalTasks?: number | null;
  doneTasks?: number | null;
  reviewRequest?: {
    id?: string | null;
    jobId?: string | null;
    status?: string | null;
    summary?: string | null;
    createdAt?: string | null;
  } | null;
  reviewSummary?: {
    latestSubmissionId?: string | null;
    latestRevisionNumber?: number | null;
    proofItemCount?: number | null;
    proofCompletenessStatus?: string | null;
    feedbackItemCount?: number | null;
    checkpointType?: string | null;
    latestSubmissionSummary?: string | null;
    latestDecisionNotes?: string | null;
    latestRejectionComment?: string | null;
    latestSubmissionStatus?: string | null;
    latestDecision?: string | null;
  } | null;
  preBuildCheckpoint?: {
    outcome?: "match" | "mismatch" | "manual_review" | null;
    status?: "approved" | "pending" | "not_requested" | null;
    reasons?: string[] | null;
  } | null;
};

export function deriveProjectDetailHeaderState(input: {
  projectProgressPct?: number | null;
  truth?: ProjectTruthLike;
  attachmentKickoffState?: AttachmentKickoffState | null;
}) {
  const attachment = input.attachmentKickoffState;
  const shouldShowAttachmentState = shouldShowAttachmentKickoffBanner(attachment);
  const hasAttachmentIssue = attachment?.status === "failed" || attachment?.status === "retryable_failure";
  if (shouldShowAttachmentState) {
    const defaultProgress = hasAttachmentIssue ? 100 : 0;
    const progressPct = Math.max(0, Math.min(100, attachment?.progressPct ?? defaultProgress));
    return {
      key: hasAttachmentIssue ? "attachment_failed" : "attachment_processing",
      progressPct,
      badgeText: hasAttachmentIssue ? "Attachment issue" : "Attachment processing",
      headline: attachment?.status === "retryable_failure" ? "Attachment processing paused" : hasAttachmentIssue ? "Attachment processing failed" : "Kickoff setup in progress",
      summary: attachment?.error || attachment?.detail || (hasAttachmentIssue
        ? attachment?.status === "retryable_failure"
          ? "Attachment intake can be retried from saved files before kickoff continues."
          : "Attachment intake hit an error and needs attention before kickoff can continue."
        : "Attached materials are still being processed before kickoff can settle."),
    } as const;
  }

  const progressPct = Math.max(0, Math.min(100, input.truth?.progressPct ?? input.projectProgressPct ?? 0));
  return {
    key: input.truth?.execution?.key || "idle",
    progressPct,
    badgeText: `${progressPct}% complete`,
    headline: input.truth?.headline || input.truth?.execution?.description || "No project work is visible yet.",
    summary: input.truth?.summary || input.truth?.execution?.description || "No project work is visible yet.",
  } as const;
}

export function deriveMilestoneDisplayState(milestone: MilestoneLike) {
  const checkpointState = deriveReviewCheckpointState({
    approvalGateStatus: milestone.deliveryReviewStatus || milestone.approvalGateStatus,
    reviewSummary: milestone.reviewSummary,
    reviewRequest: milestone.reviewRequest,
    preBuildCheckpoint: milestone.preBuildCheckpoint,
  });
  const qcState = deriveFirstPassQcState({
    approvalGateStatus: milestone.deliveryReviewStatus || milestone.approvalGateStatus,
    reviewSummary: milestone.reviewSummary,
    reviewRequest: milestone.reviewRequest,
    preBuildCheckpoint: milestone.preBuildCheckpoint,
  });

  const reviewTasksReady = (milestone.totalTasks || 0) > 0 && milestone.doneTasks === milestone.totalTasks;
  const changesRequested = milestone.deliveryReviewStatus === "rejected"
    || milestone.reviewSummary?.latestSubmissionStatus === "changes_requested"
    || milestone.reviewSummary?.latestDecision === "request_changes";
  const hasActualRevisionHistory = (milestone.reviewSummary?.latestRevisionNumber ?? 0) > 1 || changesRequested;
  const revisionCycleActive = changesRequested;
  const deliveryApproved = qcState.key === "approved";
  const reviewReady = qcState.key === "ready_for_review";
  const reviewRequested = qcState.key === "approval_requested";
  const inReview = qcState.key === "in_review";
  const reviewActive = reviewRequested || inReview;
  const rereviewActive = hasActualRevisionHistory && (reviewReady || reviewActive) && !revisionCycleActive && !deliveryApproved;
  const qaQueued = reviewTasksReady && !reviewReady && !reviewActive && !revisionCycleActive && !deliveryApproved;

  const stageState = revisionCycleActive
    ? { key: "revision_cycle", label: "Revision cycle", className: "border-amber-200 bg-amber-50 text-amber-700" }
    : deliveryApproved
      ? { key: "iteration_shipped", label: "Iteration shipped", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
      : rereviewActive
        ? { key: "rereview_active", label: inReview ? "Re-review in progress" : reviewRequested ? "Re-review requested" : "Re-review ready", className: "border-violet-200 bg-violet-50 text-violet-700" }
        : inReview
          ? { key: "delivery_review_active", label: "In review", className: "border-violet-200 bg-violet-50 text-violet-700" }
          : reviewRequested
            ? { key: "delivery_review_active", label: "Review requested", className: "border-violet-200 bg-violet-50 text-violet-700" }
            : reviewReady
              ? { key: "qa_ready", label: "Ready for review", className: "border-sky-200 bg-sky-50 text-sky-700" }
              : qaQueued
                ? { key: "qa_queued", label: "QA queued", className: "border-zinc-200 bg-zinc-50 text-zinc-700" }
                : { key: "self_review", label: "Self-review", className: "border-sky-200 bg-sky-50 text-sky-700" };

  return {
    checkpointState,
    qcState,
    stageState,
    showDecisionActions: reviewReady || reviewRequested || inReview,
    showChangesRequestedActions: checkpointState.key === "changes_requested",
    showBlockedApprovalPanel: checkpointState.key === "setup_required" || checkpointState.key === "awaiting_submission" || checkpointState.key === "awaiting_evidence",
  } as const;
}

export function isTerminalProjectStatus(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  return normalized === "completed" || normalized === "archived";
}

export function shouldShowReviewCheckpointSection(input: { projectStatus?: string | null; milestones?: MilestoneLike[] | null }) {
  if (isTerminalProjectStatus(input.projectStatus)) return false;
  return Array.isArray(input.milestones) && input.milestones.length > 0;
}

export function getCompletedProjectRevisionMilestones<T extends MilestoneLike>(milestones?: T[] | null) {
  return (Array.isArray(milestones) ? milestones : []).filter((milestone) => {
    const reviewTasksReady = (milestone.totalTasks || 0) > 0 && milestone.doneTasks === milestone.totalTasks;
    if (!reviewTasksReady) return false;
    const stageKey = deriveMilestoneDisplayState(milestone).stageState.key;
    return stageKey === "iteration_shipped" || stageKey === "revision_cycle";
  });
}

export function deriveMilestoneReviewCardCopy(milestone: MilestoneLike) {
  const milestoneDisplayState = deriveMilestoneDisplayState(milestone);
  const reviewTasksReady = (milestone.totalTasks || 0) > 0 && milestone.doneTasks === milestone.totalTasks;

  const summaryCopy = milestoneDisplayState.stageState.key === "revision_cycle"
    ? (milestone.reviewRequest?.summary || milestone.reviewSummary?.latestDecisionNotes || milestone.reviewSummary?.latestRejectionComment || "A revision is open for this milestone. Complete the requested changes, then resubmit when ready.")
    : milestoneDisplayState.stageState.key === "iteration_shipped"
      ? "This milestone is shipped and QC-approved. Open another revision only if follow-up changes are actually needed."
      : milestoneDisplayState.stageState.key === "qa_ready"
        ? "Implementation is complete, and QA/QC is the next step. Revision controls stay out of the way unless changes are actually requested."
        : milestoneDisplayState.stageState.key === "qa_queued"
          ? "Implementation is complete, but QA/QC is still waiting on earlier sequencing work. Revision controls stay hidden until review actually asks for changes."
          : "Work is still moving toward completion. Revision requests only matter once delivered work needs another pass.";

  const helperCopy = reviewTasksReady
    ? milestoneDisplayState.stageState.key === "qa_ready"
      ? "QC can run now. A revision request only appears after changes are requested, or after the milestone ships and you intentionally open one."
      : milestoneDisplayState.stageState.key === "qa_queued"
        ? "Implementation is complete and waiting for QC sequencing. Revision requests stay hidden until review actually needs them."
        : "This milestone is already complete. Only open a revision if you want another round of changes."
    : "Finish the milestone first. Revision requests stay out of the main flow until completed work needs another pass.";

  return {
    milestoneDisplayState,
    summaryCopy,
    helperCopy,
    showRevisionRequestCard: reviewTasksReady && (milestoneDisplayState.stageState.key === "revision_cycle" || milestoneDisplayState.stageState.key === "iteration_shipped"),
  } as const;
}

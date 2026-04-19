import { deriveReviewCheckpointState } from "./review-checkpoint-state.ts";

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

type MilestoneLike = {
  approvalGateStatus?: string | null;
  deliveryReviewStatus?: string | null;
  reviewSummary?: {
    latestSubmissionId?: string | null;
    proofItemCount?: number | null;
    proofCompletenessStatus?: string | null;
    feedbackItemCount?: number | null;
    checkpointType?: string | null;
    latestSubmissionSummary?: string | null;
    latestDecisionNotes?: string | null;
    latestRejectionComment?: string | null;
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
    preBuildCheckpoint: milestone.preBuildCheckpoint,
  });

  return {
    checkpointState,
    showDecisionActions: checkpointState.key === "ready_for_review",
    showChangesRequestedActions: checkpointState.key === "changes_requested",
    showBlockedApprovalPanel: checkpointState.key === "setup_required" || checkpointState.key === "awaiting_submission" || checkpointState.key === "awaiting_evidence",
  } as const;
}

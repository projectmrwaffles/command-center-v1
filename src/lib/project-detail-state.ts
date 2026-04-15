import { deriveReviewCheckpointState } from "./review-checkpoint-state.ts";

type AttachmentKickoffState = {
  status?: string;
  label?: string;
  detail?: string;
  progressPct?: number;
  active?: boolean;
  error?: string;
};

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
  reviewSummary?: {
    latestSubmissionId?: string | null;
    proofItemCount?: number | null;
    proofCompletenessStatus?: string | null;
    feedbackItemCount?: number | null;
    checkpointType?: string | null;
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
  if (attachment?.active) {
    const progressPct = Math.max(0, Math.min(100, attachment.progressPct ?? 0));
    return {
      key: "attachment_processing",
      progressPct,
      badgeText: `${attachment.label || "Kickoff setup"} ${progressPct}%`,
      headline: attachment.label || "Kickoff setup in progress",
      summary: attachment.error || attachment.detail || "Attached materials are still being processed before kickoff can settle.",
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
    approvalGateStatus: milestone.approvalGateStatus,
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

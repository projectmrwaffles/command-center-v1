function buildCheckpointNotes(summary: {
  latestDecisionNotes?: string | null;
  latestRejectionComment?: string | null;
} | null) {
  return [summary?.latestDecisionNotes, summary?.latestRejectionComment].filter(Boolean).join(" \n");
}

function isManualReviewSetupBlockedText(text: string) {
  return /manual review required|setup blocked|setup-blocked|missing package\.json|package\.json/i.test(text);
}

function isNonReviewablePrebuildPacket(summary: {
  checkpointType?: string | null;
  latestDecisionNotes?: string | null;
  latestRejectionComment?: string | null;
  latestSubmissionSummary?: string | null;
} | null) {
  if (summary?.checkpointType !== "prebuild_checkpoint") return false;
  const notes = buildCheckpointNotes(summary);
  return /no repo workspace path found\./i.test(notes)
    || isManualReviewSetupBlockedText(notes)
    || /pre-build stack checkpoint auto-cleared/i.test(summary?.latestSubmissionSummary || "");
}

function isSetupBlockedPrebuildCheckpoint(summary: {
  checkpointType?: string | null;
  latestDecisionNotes?: string | null;
  latestRejectionComment?: string | null;
} | null) {
  if (summary?.checkpointType !== "prebuild_checkpoint") return false;
  const notes = buildCheckpointNotes(summary);
  return /no repo workspace path found\.|no github repo url found for remote inspection\.|remote repo inspection unavailable:/i.test(notes) || isManualReviewSetupBlockedText(notes);
}

type ReviewSummaryLike = {
  latestSubmissionId?: string | null;
  latestSubmissionStatus?: string | null;
  proofItemCount?: number | null;
  proofCompletenessStatus?: string | null;
  feedbackItemCount?: number | null;
  checkpointType?: string | null;
  latestSubmissionSummary?: string | null;
  latestDecision?: string | null;
  latestDecisionNotes?: string | null;
  latestRejectionComment?: string | null;
} | null;

type ReviewRequestLike = {
  id?: string | null;
  jobId?: string | null;
  status?: string | null;
} | null;

type PreBuildCheckpointLike = {
  outcome?: "match" | "mismatch" | "manual_review" | null;
  status?: "approved" | "pending" | "not_requested" | null;
  reasons?: string[] | null;
} | null;

export function deriveFirstPassQcState(input: {
  approvalGateStatus?: string | null;
  reviewSummary?: ReviewSummaryLike;
  reviewRequest?: ReviewRequestLike;
  preBuildCheckpoint?: PreBuildCheckpointLike;
}) {
  const approvalGateStatus = input.approvalGateStatus || "not_requested";
  const summary = input.reviewSummary || null;
  const reviewRequest = input.reviewRequest || null;
  const latestSubmissionStatus = summary?.latestSubmissionStatus || null;
  const hasSubmission = Boolean(summary?.latestSubmissionId);
  const hasMaterials = summary?.proofCompletenessStatus === "ready" && Boolean((summary?.proofItemCount || 0) > 0);
  const nonReviewablePrebuildPacket = isNonReviewablePrebuildPacket(summary);
  const setupBlockedReason = (input.preBuildCheckpoint?.reasons || []).some((reason) => /no repo workspace path found\.|no github repo url found for remote inspection\.|remote repo inspection unavailable:/i.test(reason) || isManualReviewSetupBlockedText(reason));
  const setupBlockedPrebuild = approvalGateStatus === "pending"
    && input.preBuildCheckpoint?.status === "pending"
    && input.preBuildCheckpoint?.outcome === "manual_review"
    && (isSetupBlockedPrebuildCheckpoint(summary) || setupBlockedReason || nonReviewablePrebuildPacket);
  const changesRequested = approvalGateStatus === "rejected"
    || latestSubmissionStatus === "changes_requested"
    || summary?.latestDecision === "request_changes";
  const approved = approvalGateStatus === "approved"
    || latestSubmissionStatus === "approved"
    || summary?.latestDecision === "approve";
  const approvalExists = Boolean(reviewRequest?.id || reviewRequest?.jobId || reviewRequest?.status === "pending");
  const inReview = latestSubmissionStatus === "under_review";
  const reviewReady = approvalGateStatus === "pending" && hasMaterials && !nonReviewablePrebuildPacket;

  if (setupBlockedPrebuild) {
    return {
      key: "incomplete_packet",
      label: "Repo setup required",
      actionable: false,
      reason: "setup_required",
    } as const;
  }

  if (changesRequested) {
    return {
      key: "changes_requested",
      label: "Changes requested",
      actionable: true,
      reason: "changes_requested",
    } as const;
  }

  if (approved) {
    return {
      key: "approved",
      label: "Approved",
      actionable: false,
      reason: "approved",
    } as const;
  }

  if (inReview) {
    return {
      key: "in_review",
      label: "In review",
      actionable: true,
      reason: "in_review",
    } as const;
  }

  if (approvalExists && reviewReady) {
    return {
      key: "approval_requested",
      label: "Review requested",
      actionable: true,
      reason: "approval_exists",
    } as const;
  }

  if (reviewReady) {
    return {
      key: "ready_for_review",
      label: "Ready for review",
      actionable: true,
      reason: "ready_for_review",
    } as const;
  }

  return {
    key: "incomplete_packet",
    label: hasSubmission ? (nonReviewablePrebuildPacket ? "Manual setup required" : "Awaiting evidence") : "Awaiting submission",
    actionable: false,
    reason: hasSubmission ? (nonReviewablePrebuildPacket ? "manual_setup_required" : "awaiting_evidence") : "awaiting_submission",
  } as const;
}

export function deriveReviewCheckpointState(input: {
  approvalGateStatus?: string | null;
  reviewSummary?: ReviewSummaryLike;
  reviewRequest?: ReviewRequestLike;
  preBuildCheckpoint?: PreBuildCheckpointLike;
}) {
  const qcState = deriveFirstPassQcState(input);
  switch (qcState.key) {
    case "changes_requested":
      return { key: "changes_requested", label: qcState.label, actionable: qcState.actionable } as const;
    case "approved":
      return { key: "approved", label: qcState.label, actionable: qcState.actionable } as const;
    case "ready_for_review":
    case "approval_requested":
    case "in_review":
      return { key: "ready_for_review", label: qcState.label, actionable: qcState.actionable } as const;
    default:
      return {
        key: qcState.reason === "setup_required" ? "setup_required" : qcState.reason === "awaiting_submission" ? "awaiting_submission" : "awaiting_evidence",
        label: qcState.label,
        actionable: qcState.actionable,
      } as const;
  }
}

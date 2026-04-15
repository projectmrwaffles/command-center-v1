function buildCheckpointNotes(summary: {
  latestDecisionNotes?: string | null;
  latestRejectionComment?: string | null;
} | null) {
  return [summary?.latestDecisionNotes, summary?.latestRejectionComment].filter(Boolean).join(" \n");
}

function isNonReviewablePrebuildPacket(summary: {
  checkpointType?: string | null;
  latestDecisionNotes?: string | null;
  latestRejectionComment?: string | null;
} | null) {
  if (summary?.checkpointType !== "prebuild_checkpoint") return false;
  return /no repo workspace path found\./i.test(buildCheckpointNotes(summary));
}

function isSetupBlockedPrebuildCheckpoint(summary: {
  checkpointType?: string | null;
  latestDecisionNotes?: string | null;
  latestRejectionComment?: string | null;
} | null) {
  if (summary?.checkpointType !== "prebuild_checkpoint") return false;
  return /no repo workspace path found\.|no github repo url found for remote inspection\.|remote repo inspection unavailable:/i.test(buildCheckpointNotes(summary));
}

export function deriveReviewCheckpointState(input: {
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
}) {
  const approvalGateStatus = input.approvalGateStatus || "not_requested";
  const summary = input.reviewSummary || null;
  const hasSubmission = Boolean(summary?.latestSubmissionId);
  const hasMaterials = summary?.proofCompletenessStatus === "ready" && Boolean((summary?.proofItemCount || 0) > 0);
  const nonReviewablePrebuildPacket = isNonReviewablePrebuildPacket(summary);
  const setupBlockedReason = (input.preBuildCheckpoint?.reasons || []).some((reason) => /no repo workspace path found\.|no github repo url found for remote inspection\.|remote repo inspection unavailable:/i.test(reason));
  const setupBlockedPrebuild = approvalGateStatus === "pending"
    && input.preBuildCheckpoint?.status === "pending"
    && input.preBuildCheckpoint?.outcome === "manual_review"
    && (isSetupBlockedPrebuildCheckpoint(summary) || setupBlockedReason || nonReviewablePrebuildPacket);

  if (setupBlockedPrebuild) {
    return {
      key: "setup_required",
      label: "Repo setup required",
      actionable: false,
    } as const;
  }

  if (!hasSubmission) {
    return {
      key: "awaiting_submission",
      label: "Awaiting submission",
      actionable: false,
    } as const;
  }

  if (approvalGateStatus === "rejected") {
    return {
      key: "changes_requested",
      label: "Changes requested",
      actionable: true,
    } as const;
  }

  if (approvalGateStatus === "approved") {
    return {
      key: "approved",
      label: "Approved",
      actionable: false,
    } as const;
  }

  if (approvalGateStatus === "pending" && hasMaterials && !nonReviewablePrebuildPacket) {
    return {
      key: "ready_for_review",
      label: "Ready for review",
      actionable: true,
    } as const;
  }

  return {
    key: "awaiting_evidence",
    label: nonReviewablePrebuildPacket ? "Manual setup required" : "Awaiting evidence",
    actionable: false,
  } as const;
}

function isNonReviewablePrebuildPacket(summary: {
  checkpointType?: string | null;
  latestDecisionNotes?: string | null;
  latestRejectionComment?: string | null;
} | null) {
  if (summary?.checkpointType !== "prebuild_checkpoint") return false;
  const notes = [summary?.latestDecisionNotes, summary?.latestRejectionComment].filter(Boolean).join(" \n");
  return /no repo workspace path found\./i.test(notes);
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
}) {
  const approvalGateStatus = input.approvalGateStatus || "not_requested";
  const summary = input.reviewSummary || null;
  const hasSubmission = Boolean(summary?.latestSubmissionId);
  const hasMaterials = summary?.proofCompletenessStatus === "ready" && Boolean((summary?.proofItemCount || 0) > 0);
  const nonReviewablePrebuildPacket = isNonReviewablePrebuildPacket(summary);

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
    key: "awaiting_materials",
    label: nonReviewablePrebuildPacket ? "Manual setup required" : "Awaiting materials",
    actionable: false,
  } as const;
}

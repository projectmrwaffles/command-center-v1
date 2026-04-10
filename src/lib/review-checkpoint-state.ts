export function deriveReviewCheckpointState(input: {
  approvalGateStatus?: string | null;
  reviewSummary?: {
    latestSubmissionId?: string | null;
    proofItemCount?: number | null;
    proofCompletenessStatus?: string | null;
    feedbackItemCount?: number | null;
  } | null;
}) {
  const approvalGateStatus = input.approvalGateStatus || "not_requested";
  const summary = input.reviewSummary || null;
  const hasSubmission = Boolean(summary?.latestSubmissionId);
  const hasMaterials = Boolean((summary?.proofItemCount || 0) > 0);

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

  if (approvalGateStatus === "pending" && hasMaterials) {
    return {
      key: "ready_for_review",
      label: "Ready for review",
      actionable: true,
    } as const;
  }

  return {
    key: "awaiting_materials",
    label: "Awaiting materials",
    actionable: false,
  } as const;
}

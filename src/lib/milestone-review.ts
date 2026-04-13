import type { ProjectLinks } from "./project-links.ts";

export type StageCheckpointType = "scope_approval" | "design_review" | "delivery_review" | "acceptance_review" | "launch_approval" | "prebuild_checkpoint";
export type ApprovalType = StageCheckpointType;
export type SubmissionStatus = "draft" | "submitted" | "under_review" | "changes_requested" | "approved" | "superseded";
export type SubmissionDecision = "approve" | "request_changes";
export type ProofCompletenessStatus = "incomplete" | "ready" | "needs_update" | "archived";
export type ProofItemKind = "figma" | "screenshot" | "staging_url" | "github_pr" | "commit" | "loom" | "doc" | "artifact" | "checklist" | "note";
export type FeedbackType = "blocker" | "required" | "optional" | "question";
export type FeedbackStatus = "open" | "resolved" | "carried_forward";
export type CheckpointEvidenceRequirements = {
  screenshotRequired: boolean;
  minScreenshotCount: number;
  captureMode?: "local_app" | "manual" | null;
  captureHint?: string | null;
};

export type MilestoneSubmissionRecord = {
  id: string;
  sprint_id: string;
  checkpoint_type: StageCheckpointType;
  evidence_requirements: CheckpointEvidenceRequirements | Record<string, unknown> | null;
  submitted_by_agent_id: string | null;
  decided_by_agent_id: string | null;
  approval_id: string | null;
  revision_number: number;
  summary: string;
  what_changed: string;
  risks: string | null;
  status: SubmissionStatus;
  decision: SubmissionDecision | null;
  decision_notes: string | null;
  rejection_comment: string | null;
  submitted_at: string;
  decided_at: string | null;
  superseded_by_submission_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProofBundleRecord = {
  id: string;
  submission_id: string;
  created_by_agent_id: string | null;
  title: string;
  summary: string | null;
  completeness_status: ProofCompletenessStatus;
  created_at: string;
  updated_at: string;
};

export type ProofItemRecord = {
  id: string;
  proof_bundle_id: string;
  created_by_agent_id: string | null;
  kind: ProofItemKind;
  label: string;
  url: string | null;
  storage_path: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  sort_order: number;
  created_at: string;
};

export type SubmissionFeedbackItemRecord = {
  id: string;
  submission_id: string;
  author_agent_id: string | null;
  feedback_type: FeedbackType;
  body: string;
  status: FeedbackStatus;
  created_at: string;
  resolved_at: string | null;
};

export type ReviewQueueItem = {
  projectId: string;
  projectName: string;
  sprintId: string;
  sprintName: string;
  submissionId: string;
  revisionNumber: number;
  ownerName: string | null;
  submittedAt: string;
  proofCompletenessStatus: ProofCompletenessStatus | null;
  proofItemCount: number;
  status: SubmissionStatus;
};

export type MilestoneReviewDetail = {
  sprint: {
    id: string;
    projectId: string;
    name: string;
    status: string | null;
    approvalGateRequired: boolean | null;
    approvalGateStatus: string | null;
  };
  latestSubmission: MilestoneSubmissionRecord | null;
  submissions: MilestoneSubmissionRecord[];
  latestProofBundle: ProofBundleRecord | null;
  latestProofItems: ProofItemRecord[];
  latestFeedbackItems: SubmissionFeedbackItemRecord[];
  timeline: Array<{
    id: string;
    eventType: string;
    createdAt: string;
    payload: Record<string, unknown> | null;
  }>;
};

export function isStageCheckpointType(value: unknown): value is StageCheckpointType {
  return typeof value === "string" && ["scope_approval", "design_review", "delivery_review", "acceptance_review", "launch_approval", "prebuild_checkpoint"].includes(value);
}

export function isApprovalType(value: unknown): value is ApprovalType {
  return isStageCheckpointType(value);
}

export function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  return typeof value === "string" && ["draft", "submitted", "under_review", "changes_requested", "approved", "superseded"].includes(value);
}

export function isProofCompletenessStatus(value: unknown): value is ProofCompletenessStatus {
  return typeof value === "string" && ["incomplete", "ready", "needs_update", "archived"].includes(value);
}

export function isProofItemKind(value: unknown): value is ProofItemKind {
  return typeof value === "string" && ["figma", "screenshot", "staging_url", "github_pr", "commit", "loom", "doc", "artifact", "checklist", "note"].includes(value);
}

export function isFeedbackType(value: unknown): value is FeedbackType {
  return typeof value === "string" && ["blocker", "required", "optional", "question"].includes(value);
}

export function formatCheckpointTypeLabel(value?: StageCheckpointType | string | null) {
  if (!value) return "Delivery review";
  switch (value) {
    case "scope_approval": return "Scope approval";
    case "design_review": return "Design / UX review";
    case "delivery_review": return "Delivery review";
    case "acceptance_review": return "Acceptance review";
    case "launch_approval": return "Launch approval";
    case "prebuild_checkpoint": return "Pre-build checkpoint";
    default: return String(value).replace(/_/g, " ");
  }
}

export function getCheckpointEvidenceRequirements(checkpointType?: StageCheckpointType | string | null, value?: unknown): CheckpointEvidenceRequirements {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const defaults: CheckpointEvidenceRequirements = checkpointType === "design_review"
    ? {
        screenshotRequired: true,
        minScreenshotCount: 1,
        captureMode: "local_app",
        captureHint: "Attach at least one current screenshot from the local app capture flow before review.",
      }
    : {
        screenshotRequired: false,
        minScreenshotCount: 0,
      };

  return {
    screenshotRequired: typeof raw.screenshotRequired === "boolean" ? raw.screenshotRequired : defaults.screenshotRequired,
    minScreenshotCount: typeof raw.minScreenshotCount === "number" && Number.isFinite(raw.minScreenshotCount) ? raw.minScreenshotCount : defaults.minScreenshotCount,
    captureMode: raw.captureMode === "local_app" || raw.captureMode === "manual" ? raw.captureMode : defaults.captureMode ?? null,
    captureHint: typeof raw.captureHint === "string" ? raw.captureHint : defaults.captureHint ?? null,
  };
}

export function countProofItemsByKind(items: Array<{ kind?: string | null }> | null | undefined, kind: ProofItemKind) {
  return (items || []).filter((item) => item?.kind === kind).length;
}

export function countDeliverableEvidenceItems(items: Array<{ kind?: string | null }> | null | undefined) {
  return (items || []).filter((item) => {
    const kind = item?.kind;
    return kind != null && kind !== "note" && kind !== "checklist";
  }).length;
}

export function computeProofBundleCompletenessStatus(input: {
  checkpointType?: StageCheckpointType | string | null;
  evidenceRequirements?: unknown;
  items: Array<{ kind?: string | null }>;
}): ProofCompletenessStatus {
  const validation = validateProofBundleRequirements(input);
  return validation.ok ? "ready" : "incomplete";
}

export function validateProofBundleRequirements(input: {
  checkpointType?: StageCheckpointType | string | null;
  evidenceRequirements?: unknown;
  items: Array<{ kind?: string | null }>;
}) {
  const requirements = getCheckpointEvidenceRequirements(input.checkpointType, input.evidenceRequirements);
  const screenshotCount = countProofItemsByKind(input.items, "screenshot");
  const deliverableEvidenceCount = countDeliverableEvidenceItems(input.items);
  if (input.checkpointType === "delivery_review" && deliverableEvidenceCount < 1) {
    return {
      ok: false,
      message: "This delivery review requires at least one real deliverable artifact, such as a screenshot, preview URL, PR, commit, Loom, doc, or uploaded artifact, before review.",
      requirements,
      screenshotCount,
      deliverableEvidenceCount,
    };
  }
  if (requirements.screenshotRequired && screenshotCount < requirements.minScreenshotCount) {
    return {
      ok: false,
      message: requirements.minScreenshotCount > 1
        ? `This ${formatCheckpointTypeLabel(input.checkpointType).toLowerCase()} requires at least ${requirements.minScreenshotCount} screenshots before review.`
        : `This ${formatCheckpointTypeLabel(input.checkpointType).toLowerCase()} requires at least one screenshot before review.`,
      requirements,
      screenshotCount,
      deliverableEvidenceCount,
    };
  }
  return { ok: true, requirements, screenshotCount, deliverableEvidenceCount };
}

export function mapSubmissionStatusToTaskReviewStatus(status: SubmissionStatus): string {
  switch (status) {
    case "submitted":
    case "under_review":
      return "awaiting_review";
    case "changes_requested":
      return "revision_requested";
    case "approved":
      return "approved";
    default:
      return "not_requested";
  }
}

export function mapSubmissionStatusToApprovalGateStatus(status: SubmissionStatus): string {
  switch (status) {
    case "submitted":
    case "under_review":
      return "pending";
    case "changes_requested":
      return "rejected";
    case "approved":
      return "approved";
    default:
      return "not_requested";
  }
}

export function buildReviewEventPayload(input: {
  submissionId: string;
  sprintId: string;
  revisionNumber: number;
  summary?: string | null;
  decision?: SubmissionDecision | null;
  note?: string | null;
}) {
  return {
    submission_id: input.submissionId,
    sprint_id: input.sprintId,
    revision_number: input.revisionNumber,
    summary: input.summary || null,
    decision: input.decision || null,
    note: input.note || null,
  };
}

export function buildProofContextLinks(input: { links?: ProjectLinks | null }) {
  return input.links || null;
}

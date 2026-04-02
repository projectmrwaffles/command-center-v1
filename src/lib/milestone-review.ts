import type { ProjectLinks } from "@/lib/project-links";

export type SubmissionStatus = "draft" | "submitted" | "under_review" | "changes_requested" | "approved" | "superseded";
export type SubmissionDecision = "approve" | "request_changes";
export type ProofCompletenessStatus = "incomplete" | "ready" | "needs_update" | "archived";
export type ProofItemKind = "figma" | "screenshot" | "staging_url" | "github_pr" | "commit" | "loom" | "doc" | "artifact" | "checklist" | "note";
export type FeedbackType = "blocker" | "required" | "optional" | "question";
export type FeedbackStatus = "open" | "resolved" | "carried_forward";

export type MilestoneSubmissionRecord = {
  id: string;
  sprint_id: string;
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

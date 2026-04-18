import type { ProjectLinks } from "./project-links.ts";

export type StageCheckpointType = "scope_approval" | "design_review" | "delivery_review" | "acceptance_review" | "content_review" | "launch_approval" | "prebuild_checkpoint";
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
  requiredEvidenceKinds?: ProofItemKind[];
  requiredEvidenceKindsMode?: "any" | "all" | null;
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
  return typeof value === "string" && ["scope_approval", "design_review", "delivery_review", "acceptance_review", "content_review", "launch_approval", "prebuild_checkpoint"].includes(value);
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
    case "content_review": return "Content review";
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
    : checkpointType === "scope_approval"
      ? {
          screenshotRequired: false,
          minScreenshotCount: 0,
          requiredEvidenceKinds: ["doc", "checklist", "loom"],
          requiredEvidenceKindsMode: "any",
          captureHint: "Attach the actual scope artifact, such as a planning doc, checklist, or Loom walkthrough, before requesting scope approval.",
        }
    : checkpointType === "acceptance_review"
      ? {
          screenshotRequired: false,
          minScreenshotCount: 0,
          requiredEvidenceKinds: ["screenshot", "staging_url", "loom"],
          requiredEvidenceKindsMode: "any",
        }
      : checkpointType === "content_review"
        ? {
            screenshotRequired: false,
            minScreenshotCount: 0,
            requiredEvidenceKinds: ["doc", "artifact", "screenshot", "staging_url", "loom"],
            requiredEvidenceKindsMode: "any",
          }
        : checkpointType === "launch_approval"
          ? {
              screenshotRequired: false,
              minScreenshotCount: 0,
              requiredEvidenceKinds: ["staging_url"],
              requiredEvidenceKindsMode: "all",
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
    requiredEvidenceKinds: Array.isArray(raw.requiredEvidenceKinds)
      ? raw.requiredEvidenceKinds.filter(isProofItemKind)
      : defaults.requiredEvidenceKinds,
    requiredEvidenceKindsMode: raw.requiredEvidenceKindsMode === "any" || raw.requiredEvidenceKindsMode === "all"
      ? raw.requiredEvidenceKindsMode
      : defaults.requiredEvidenceKindsMode ?? null,
  };
}

function hasExplicitEvidencePolicy(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.screenshotRequired === "boolean"
    || typeof raw.minScreenshotCount === "number"
    || Array.isArray(raw.requiredEvidenceKinds)
    || raw.requiredEvidenceKindsMode === "any"
    || raw.requiredEvidenceKindsMode === "all"
    || raw.captureMode === "local_app"
    || raw.captureMode === "manual"
    || typeof raw.captureHint === "string";
}

export function resolveMilestoneCheckpointType(input: {
  checkpointType?: StageCheckpointType | string | null;
  sprintName?: string | null;
  phaseKey?: string | null;
  taskTypes?: Array<string | null | undefined> | null;
}) {
  if (isStageCheckpointType(input.checkpointType)) return input.checkpointType;

  const phaseKey = String(input.phaseKey || "").toLowerCase();
  const sprintName = String(input.sprintName || "").toLowerCase();
  const taskTypes = (input.taskTypes || []).map((value) => String(value || "").toLowerCase());
  const isDiscoveryMilestone = phaseKey === "discover"
    || /\bdiscover\b|\bscope\b|\bplan\b|\bbrief\b/.test(sprintName)
    || taskTypes.includes("discovery_plan");
  const isContentMilestone = phaseKey === "message"
    || /\bmessage\b|\bmessaging\b|\bcontent\b|\bcopy\b/.test(sprintName)
    || taskTypes.includes("content_messaging");
  const isLaunchMilestone = (phaseKey === "launch" || phaseKey === "release" || phaseKey === "validate" || taskTypes.includes("qa_validation"))
    && /\blaunch\b|\blaunch readiness\b|\bgo[- ]live\b|\brelease\b/.test(sprintName);

  if (isDiscoveryMilestone) return "scope_approval" satisfies StageCheckpointType;
  if (isContentMilestone) return "content_review" satisfies StageCheckpointType;
  if (isLaunchMilestone) return "launch_approval" satisfies StageCheckpointType;
  return null;
}

type DeliveryReviewProjectSignals = {
  projectType?: string | null;
  projectIntake?: {
    shape?: string | null;
    capabilities?: string[] | null;
  } | null;
};

function isUiBearingDeliveryProject(input: DeliveryReviewProjectSignals) {
  const projectType = String(input.projectType || "").toLowerCase();
  const shape = String(input.projectIntake?.shape || "").toLowerCase();
  const capabilities = (input.projectIntake?.capabilities || []).map((value) => String(value || "").toLowerCase());

  if (capabilities.includes("frontend") || capabilities.includes("ux-ui")) return true;
  if (["website", "web-app", "native-app", "launch-campaign"].includes(shape)) return true;
  if (["web_app", "native_app", "marketing", "marketing_growth"].includes(projectType)) return true;
  return false;
}

export function deriveMilestoneEvidenceRequirements(input: {
  checkpointType?: StageCheckpointType | string | null;
  explicitRequirements?: unknown;
  sprintName?: string | null;
  phaseKey?: string | null;
  taskTypes?: Array<string | null | undefined> | null;
  projectType?: string | null;
  projectIntake?: {
    shape?: string | null;
    capabilities?: string[] | null;
  } | null;
}) {
  const resolvedCheckpointType = resolveMilestoneCheckpointType(input) || input.checkpointType;
  const base = getCheckpointEvidenceRequirements(resolvedCheckpointType, input.explicitRequirements);
  if (hasExplicitEvidencePolicy(input.explicitRequirements)) return base;
  const phaseKey = String(input.phaseKey || "").toLowerCase();
  const sprintName = String(input.sprintName || "").toLowerCase();
  const taskTypes = (input.taskTypes || []).map((value) => String(value || "").toLowerCase());
  const isValidationMilestone = phaseKey === "validate"
    || /\bvalidate\b|\bqa\b|\bacceptance\b/.test(sprintName)
    || taskTypes.includes("qa_validation");
  const isDiscoveryMilestone = phaseKey === "discover"
    || /\bdiscover\b|\bscope\b|\bplan\b|\bbrief\b/.test(sprintName)
    || taskTypes.includes("discovery_plan");
  const isContentMilestone = phaseKey === "message"
    || /\bmessage\b|\bmessaging\b|\bcontent\b|\bcopy\b/.test(sprintName)
    || taskTypes.includes("content_messaging");
  const isLaunchMilestone = (phaseKey === "launch" || phaseKey === "release" || phaseKey === "validate" || taskTypes.includes("qa_validation"))
    && /\blaunch\b|\blaunch readiness\b|\bgo[- ]live\b|\brelease\b/.test(sprintName);

  if (isDiscoveryMilestone && resolvedCheckpointType === "scope_approval") {
    const requiredEvidenceKinds = new Set<ProofItemKind>(base.requiredEvidenceKinds || []);
    requiredEvidenceKinds.add("doc");
    requiredEvidenceKinds.add("checklist");
    requiredEvidenceKinds.add("loom");

    return {
      ...base,
      requiredEvidenceKinds: Array.from(requiredEvidenceKinds),
      requiredEvidenceKindsMode: "any" as const,
      captureHint: base.captureHint || "Attach the actual scope artifact, such as a planning doc, checklist, or Loom walkthrough, before requesting scope approval.",
    } satisfies CheckpointEvidenceRequirements;
  }

  if (isContentMilestone && resolvedCheckpointType === "content_review") {
    const requiredEvidenceKinds = new Set<ProofItemKind>(base.requiredEvidenceKinds || []);
    requiredEvidenceKinds.add("doc");
    requiredEvidenceKinds.add("artifact");
    requiredEvidenceKinds.add("screenshot");
    requiredEvidenceKinds.add("staging_url");
    requiredEvidenceKinds.add("loom");

    return {
      ...base,
      requiredEvidenceKinds: Array.from(requiredEvidenceKinds),
      requiredEvidenceKindsMode: "any" as const,
      captureHint: base.captureHint || "Attach the actual messaging artifact to review, such as a draft doc, screenshot, preview URL, exported asset, or Loom walkthrough.",
    } satisfies CheckpointEvidenceRequirements;
  }

  if (isLaunchMilestone && resolvedCheckpointType === "launch_approval") {
    return {
      ...base,
      requiredEvidenceKinds: ["staging_url"],
      requiredEvidenceKindsMode: "all" as const,
      captureHint: base.captureHint || "Attach the launch-ready staging or live candidate URL before requesting launch approval.",
    } satisfies CheckpointEvidenceRequirements;
  }

  const isBuildMilestone = phaseKey === "build"
    || /\bbuild\b|\bimplementation\b|\bship\b/.test(sprintName)
    || taskTypes.includes("build_implementation");

  if (resolvedCheckpointType === "delivery_review" && isBuildMilestone) {
    const requiredEvidenceKinds = new Set<ProofItemKind>(base.requiredEvidenceKinds || []);
    requiredEvidenceKinds.add("screenshot");
    requiredEvidenceKinds.add("staging_url");
    requiredEvidenceKinds.add("github_pr");
    requiredEvidenceKinds.add("commit");
    requiredEvidenceKinds.add("loom");

    const uiBearing = isUiBearingDeliveryProject(input);

    return {
      ...base,
      screenshotRequired: uiBearing,
      minScreenshotCount: uiBearing ? Math.max(base.minScreenshotCount || 0, 1) : 0,
      captureMode: uiBearing ? (base.captureMode || "local_app") : (base.captureMode ?? null),
      requiredEvidenceKinds: Array.from(requiredEvidenceKinds),
      requiredEvidenceKindsMode: base.requiredEvidenceKindsMode || "any",
      captureHint: uiBearing
        ? "Attach at least one real screenshot from the running UI before requesting build delivery review. Build success alone is not enough for UI work."
        : (base.captureHint || "Attach at least one concrete build artifact, such as a screenshot, preview URL, PR, commit, or Loom walkthrough, before requesting review."),
    } satisfies CheckpointEvidenceRequirements;
  }

  if (!isValidationMilestone) return base;

  const requiredEvidenceKinds = new Set<ProofItemKind>(base.requiredEvidenceKinds || []);
  requiredEvidenceKinds.add("screenshot");
  requiredEvidenceKinds.add("staging_url");
  requiredEvidenceKinds.add("loom");

  return {
    ...base,
    requiredEvidenceKinds: Array.from(requiredEvidenceKinds),
    requiredEvidenceKindsMode: "any" as const,
    captureHint: base.captureHint || "Attach validation evidence for this milestone, such as a screenshot, staging URL, or Loom walkthrough, before requesting review.",
  } satisfies CheckpointEvidenceRequirements;
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

export function countMatchingProofKinds(items: Array<{ kind?: string | null }> | null | undefined, kinds: ProofItemKind[]) {
  const allowed = new Set(kinds);
  return (items || []).filter((item) => item?.kind && allowed.has(item.kind as ProofItemKind)).length;
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
  const requirements = deriveMilestoneEvidenceRequirements({
    checkpointType: input.checkpointType,
    explicitRequirements: input.evidenceRequirements,
  });
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
        : input.checkpointType === "delivery_review"
          ? "This UI delivery review requires at least one real screenshot from the running app before review can proceed."
          : `This ${formatCheckpointTypeLabel(input.checkpointType).toLowerCase()} requires at least one screenshot before review.`,
      requirements,
      screenshotCount,
      deliverableEvidenceCount,
    };
  }
  if ((requirements.requiredEvidenceKinds?.length || 0) > 0) {
    const matchedRequiredEvidenceCount = countMatchingProofKinds(input.items, requirements.requiredEvidenceKinds || []);
    const satisfiesRequiredKinds = requirements.requiredEvidenceKindsMode === "all"
      ? matchedRequiredEvidenceCount >= (requirements.requiredEvidenceKinds?.length || 0)
      : matchedRequiredEvidenceCount > 0;
    if (!satisfiesRequiredKinds) {
      const requiredKindsLabel = (requirements.requiredEvidenceKinds || []).map((kind) => kind.replace(/_/g, " ")).join(requirements.requiredEvidenceKindsMode === "all" ? " + " : " or ");
      return {
        ok: false,
        message: requirements.requiredEvidenceKindsMode === "all"
          ? `This ${formatCheckpointTypeLabel(input.checkpointType).toLowerCase()} requires ${requiredKindsLabel} evidence before review.`
          : `This ${formatCheckpointTypeLabel(input.checkpointType).toLowerCase()} requires at least one ${requiredKindsLabel} evidence item before review.`,
        requirements,
        screenshotCount,
        deliverableEvidenceCount,
        matchedRequiredEvidenceCount,
      };
    }
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

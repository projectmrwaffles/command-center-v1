import assert from "node:assert/strict";

import { deriveMilestoneEvidenceRequirements, computeProofBundleCompletenessStatus, validateProofBundleRequirements } from "../src/lib/milestone-review.ts";
import { deriveReviewCheckpointState } from "../src/lib/review-checkpoint-state.ts";

const generatedValidateRequirements = deriveMilestoneEvidenceRequirements({
  checkpointType: "delivery_review",
  sprintName: "Phase 3 · Validate",
  phaseKey: "validate",
  taskTypes: ["qa_validation"],
});

assert.deepEqual(generatedValidateRequirements.requiredEvidenceKinds, ["screenshot", "staging_url", "loom"]);
assert.equal(generatedValidateRequirements.requiredEvidenceKindsMode, "any");

const codeOnlyValidation = validateProofBundleRequirements({
  checkpointType: "delivery_review",
  evidenceRequirements: generatedValidateRequirements,
  items: [{ kind: "github_pr" }],
});
assert.equal(codeOnlyValidation.ok, false, "validate milestone should not become reviewable from code-only proof");
assert.match(codeOnlyValidation.message || "", /requires at least one screenshot or staging url or loom evidence item/i);

const awaitingEvidence = deriveReviewCheckpointState({
  approvalGateStatus: "pending",
  reviewSummary: {
    latestSubmissionId: "sub_validate_1",
    checkpointType: "delivery_review",
    proofCompletenessStatus: computeProofBundleCompletenessStatus({
      checkpointType: "delivery_review",
      evidenceRequirements: generatedValidateRequirements,
      items: [{ kind: "github_pr" }],
    }),
    proofItemCount: 1,
  },
});
assert.equal(awaitingEvidence.key, "awaiting_evidence");

const readyValidation = validateProofBundleRequirements({
  checkpointType: "delivery_review",
  evidenceRequirements: generatedValidateRequirements,
  items: [{ kind: "github_pr" }, { kind: "screenshot" }],
});
assert.equal(readyValidation.ok, true, "validate milestone should become reviewable once validation evidence exists");

const readyForReview = deriveReviewCheckpointState({
  approvalGateStatus: "pending",
  reviewSummary: {
    latestSubmissionId: "sub_validate_2",
    checkpointType: "delivery_review",
    proofCompletenessStatus: computeProofBundleCompletenessStatus({
      checkpointType: "delivery_review",
      evidenceRequirements: generatedValidateRequirements,
      items: [{ kind: "github_pr" }, { kind: "screenshot" }],
    }),
    proofItemCount: 2,
  },
});
assert.equal(readyForReview.key, "ready_for_review");

const setupRequired = deriveReviewCheckpointState({
  approvalGateStatus: "pending",
  reviewSummary: null,
  preBuildCheckpoint: {
    outcome: "manual_review",
    status: "pending",
    reasons: ["No repo workspace path found."],
  },
});
assert.equal(setupRequired.key, "setup_required");

console.log("PASS milestone-generated evidence requirements keep setup_required, awaiting_evidence, and ready_for_review distinct");

import assert from "node:assert/strict";
import { deriveReviewCheckpointState } from "../src/lib/review-checkpoint-state.ts";

const setupBlocked = deriveReviewCheckpointState({
  approvalGateStatus: "pending",
  reviewSummary: null,
  preBuildCheckpoint: {
    outcome: "manual_review",
    status: "pending",
    reasons: ["No repo workspace path found."],
  },
});
assert.equal(setupBlocked.key, "setup_required");
assert.equal(setupBlocked.actionable, false);

const awaitingEvidence = deriveReviewCheckpointState({
  approvalGateStatus: "pending",
  reviewSummary: {
    latestSubmissionId: "sub_1",
    checkpointType: "delivery_review",
    proofCompletenessStatus: "incomplete",
    proofItemCount: 1,
  },
});
assert.equal(awaitingEvidence.key, "awaiting_evidence");
assert.equal(awaitingEvidence.actionable, false);

const readyForReview = deriveReviewCheckpointState({
  approvalGateStatus: "pending",
  reviewSummary: {
    latestSubmissionId: "sub_2",
    checkpointType: "delivery_review",
    proofCompletenessStatus: "ready",
    proofItemCount: 2,
  },
});
assert.equal(readyForReview.key, "ready_for_review");
assert.equal(readyForReview.actionable, true);

console.log("PASS dynamic checkpoint state separates setup-blocked, evidence-incomplete, and truly reviewable states");

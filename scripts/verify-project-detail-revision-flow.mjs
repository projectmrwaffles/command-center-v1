import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deriveMilestoneReviewCardCopy, deriveMilestoneDisplayState, shouldShowReviewCheckpointSection } from "../src/lib/project-detail-state.ts";

const activeReadyMilestone = {
  id: "sprint-build",
  name: "Build",
  status: "completed",
  phaseKey: "build",
  phaseOrder: 2,
  deliveryReviewRequired: true,
  deliveryReviewStatus: "pending",
  totalTasks: 3,
  doneTasks: 3,
  reviewRequest: null,
  reviewSummary: {
    latestSubmissionId: null,
    latestSubmissionStatus: null,
    latestRevisionNumber: 1,
    checkpointType: "delivery_review",
    latestSubmissionSummary: null,
    latestDecision: null,
    latestDecisionNotes: null,
    latestRejectionComment: null,
    proofItemCount: 0,
    proofCompletenessStatus: null,
    feedbackItemCount: 0,
  },
};

const shippedMilestone = {
  ...activeReadyMilestone,
  deliveryReviewStatus: "approved",
  reviewSummary: {
    ...activeReadyMilestone.reviewSummary,
    latestSubmissionId: "submission-build-1",
    latestSubmissionStatus: "approved",
    proofItemCount: 2,
    proofCompletenessStatus: "ready",
  },
};

const activeCopy = deriveMilestoneReviewCardCopy(activeReadyMilestone);
const shippedCopy = deriveMilestoneReviewCardCopy(shippedMilestone);
const shippedState = deriveMilestoneDisplayState(shippedMilestone);
const pageSource = fs.readFileSync(path.resolve("./src/app/projects/[id]/page.tsx"), "utf8");

assert.equal(shouldShowReviewCheckpointSection({ projectStatus: "active", milestones: [activeReadyMilestone] }), true, "Active projects should still surface milestone status when delivery work needs review");
assert.equal(activeCopy.showRevisionRequestCard, false, "Ready-for-QC milestones should not show revision request controls before completion/shipping");
assert.match(activeCopy.summaryCopy, /QA\/QC is the next step/i, "Active milestone copy should frame review as QC, not checkpoint workflow");
assert.equal(shippedState.stageState.key, "iteration_shipped", "Approved completed milestone should resolve to shipped state");
assert.equal(shippedCopy.showRevisionRequestCard, true, "Shipped milestones should expose explicit revision requests");
assert.match(shippedCopy.summaryCopy, /shipped and QC-approved/i, "Shipped milestone copy should preserve the completed state");
assert.match(pageSource, /title="Delivery milestones"/, "Project detail page should use delivery-milestone framing instead of review checkpoints");
assert.match(pageSource, /const showCheckpointBadge = false;/, "Task board should demote checkpoint badges from the main workflow surface");

console.log("verify-project-detail-revision-flow: ok", JSON.stringify({
  activeSummary: activeCopy.summaryCopy,
  shippedSummary: shippedCopy.summaryCopy,
  shippedStage: shippedState.stageState.key,
}, null, 2));

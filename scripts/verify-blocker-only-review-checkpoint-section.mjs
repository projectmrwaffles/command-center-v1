import assert from "node:assert/strict";
import { shouldShowReviewCheckpointSection } from "../src/lib/project-detail-state.ts";

const blockerOnlyMilestone = {
  id: "sprint-build-blocker",
  name: "Build",
  status: "active",
  phaseKey: "build",
  phaseOrder: 1,
  checkpointType: "prebuild_checkpoint",
  totalTasks: 0,
  doneTasks: 0,
  reviewRequest: null,
  preBuildCheckpoint: {
    outcome: "mismatch",
    reasons: ["repo_stack_mismatch"],
    summary: "Build is blocked until the linked repo matches the PRD stack contract.",
  },
};

assert.equal(
  shouldShowReviewCheckpointSection({
    projectStatus: "active",
    milestones: [blockerOnlyMilestone],
  }),
  true,
  "Active projects should keep the review checkpoint section visible when the only checkpoint content is a blocker card",
);

assert.equal(
  shouldShowReviewCheckpointSection({
    projectStatus: "completed",
    milestones: [blockerOnlyMilestone],
  }),
  false,
  "Completed projects should still hide the review checkpoint section even if blocker-like checkpoint data exists",
);

console.log("verify-blocker-only-review-checkpoint-section: ok", JSON.stringify({
  activeProjectVisible: true,
  completedProjectVisible: false,
  milestoneId: blockerOnlyMilestone.id,
}, null, 2));

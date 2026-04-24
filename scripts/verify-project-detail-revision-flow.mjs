import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deriveMilestoneReviewCardCopy, deriveMilestoneDisplayState } from "../src/lib/project-detail-state.ts";
import { buildTaskMetadata, generateTaskDescription } from "../src/lib/task-model.ts";

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
const modalSource = fs.readFileSync(path.resolve("./src/components/project/structured-task-modal.tsx"), "utf8");
const taskRouteSource = fs.readFileSync(path.resolve("./src/app/api/projects/[id]/tasks/route.ts"), "utf8");

assert.equal(activeCopy.showRevisionRequestCard, false, "Ready-for-QC milestones should not show revision request controls before completion/shipping");
assert.match(activeCopy.summaryCopy, /QA\/QC is the next step/i, "Active milestone copy should frame review as QC, not checkpoint workflow");
assert.equal(shippedState.stageState.key, "iteration_shipped", "Approved completed milestone should resolve to shipped state");
assert.equal(shippedCopy.showRevisionRequestCard, true, "Shipped milestones should expose explicit revision requests");
assert.match(shippedCopy.summaryCopy, /shipped and QC-approved/i, "Shipped milestone copy should preserve the completed state");
assert.match(pageSource, /<Section title="Project work"/, "Project detail page should frame the main board as project work");
assert.doesNotMatch(pageSource, /<Section title="Approvals & checkpoints"/, "Project detail page should not keep a separate approvals and checkpoints card once project work is canonical");
assert.match(pageSource, /Review & revision flow/, "Project detail page should keep review and revision controls inside the Project work surface");
assert.match(pageSource, /Add follow-up work/, "Project actions should expose the follow-up work entry point");
assert.match(modalSource, /label: "Revise delivered work"/, "Follow-up modal should expose the revise-delivered-work path");
assert.match(modalSource, /label: "Add deliverable"/, "Follow-up modal should expose the add-deliverable path");
assert.match(modalSource, /label: "Add support work"/, "Follow-up modal should expose the support-work path");
assert.match(modalSource, /revision_source_task_id/, "Revision modal payload should carry the selected delivered task id");
assert.match(taskRouteSource, /metadata\.revision_source_task_id = revision_source_task_id\.trim\(\)/, "Task creation route should persist revision lineage in task metadata");
assert.match(taskRouteSource, /metadata\.follow_up_intent = follow_up_intent\.trim\(\)/, "Task creation route should persist follow-up intent in task metadata");

const revisionMetadata = buildTaskMetadata("build_implementation", {
  implementation_kind: "bug_fix",
  target_environment: "web_app",
});
revisionMetadata.follow_up_intent = "revise_delivered_work";
revisionMetadata.revision_source_task_id = "task-shipped-1";
revisionMetadata.revision_source_task_title = "Ship project workspace";

const revisionDescription = generateTaskDescription({
  taskType: "build_implementation",
  taskGoal: "tighten post-launch regression fix",
  metadata: revisionMetadata,
  contextNote: "Revision target: Ship project workspace\n\nLineage note: keep this work connected to the delivered item above.",
});

assert.match(revisionDescription, /Revision target: Ship project workspace/, "Revision descriptions should preserve lineage context for the selected delivered item");
assert.equal(revisionMetadata.revision_source_task_id, "task-shipped-1", "Revision metadata should retain the selected delivered task id");

console.log("verify-project-detail-revision-flow: ok", JSON.stringify({
  activeSummary: activeCopy.summaryCopy,
  shippedSummary: shippedCopy.summaryCopy,
  shippedStage: shippedState.stageState.key,
  revisionMetadata,
}, null, 2));

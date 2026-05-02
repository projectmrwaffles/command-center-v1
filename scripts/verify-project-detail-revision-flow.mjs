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
const taskDetailSource = fs.readFileSync(path.resolve("./src/components/project/task-detail-modal.tsx"), "utf8");
const taskRouteSource = fs.readFileSync(path.resolve("./src/app/api/projects/[id]/tasks/route.ts"), "utf8");
const decisionCardSource = fs.readFileSync(path.resolve("./src/components/project/revision-request-card.tsx"), "utf8");
const decisionRouteSource = fs.readFileSync(path.resolve("./src/app/api/projects/[id]/revision-decisions/route.ts"), "utf8");

assert.equal(activeCopy.showRevisionRequestCard, false, "Ready-for-QC milestones should not show revision request controls before completion/shipping");
assert.match(activeCopy.summaryCopy, /QA\/QC is the next step/i, "Active milestone copy should frame review as QC, not checkpoint workflow");
assert.equal(shippedState.stageState.key, "iteration_shipped", "Approved completed milestone should resolve to shipped state");
assert.equal(shippedCopy.showRevisionRequestCard, true, "Shipped milestones should expose explicit revision requests");
assert.match(shippedCopy.summaryCopy, /shipped and QC-approved/i, "Shipped milestone copy should preserve the completed state");
assert.match(pageSource, /<Section title="Project work"/, "Project detail page should frame the main board as project work");
assert.doesNotMatch(pageSource, /<Section title="Approvals & review"/, "Project detail page should no longer expose a separate approvals and review section");
assert.doesNotMatch(pageSource, /<Section title="Approvals & checkpoints"/, "Project detail page should not keep a separate approvals and checkpoints card once project work is canonical");
assert.match(pageSource, /Capture the next work item, then use secondary controls only when needed\./, "Project actions should guide users into the message-first follow-up flow");
assert.match(pageSource, /<Section title="Revision implementation decisions"/, "Project detail page should expose the implementation-forward revision decision surface");
assert.match(pageSource, /deriveMilestoneDecisionState\(milestone\)/, "Project detail page should project revision state into product decision language");
assert.match(pageSource, /Add follow-up work/, "Project actions should expose the follow-up work entry point");
assert.match(pageSource, /payload\.follow_up_intent === "revise_delivered_work"/, "Project detail submit flow should detect revision-linked follow-up requests");
assert.match(pageSource, /\/api\/projects\/\$\{projectId\}\/revision-requests/, "Revision-linked follow-up requests should use the real revision request API path");
assert.match(pageSource, /revisionSourceTaskId: payload\.revision_source_task_id/, "Revision-linked follow-up requests should preserve the selected delivered work id");
assert.match(decisionCardSource, /Approve and Start Implementation/, "Decision card should expose implementation as the primary forward action");
assert.match(decisionCardSource, /Needs More Design Work/, "Decision card should preserve a clear send-back path for more design work");
assert.doesNotMatch(decisionCardSource, /Keep This in the Design Loop/, "Decision card should not preserve a fallback design-loop action");
assert.match(decisionCardSource, /What happens next/, "Decision card should explain the outcome of the primary action");
assert.match(decisionCardSource, /implementation\/commit flow/i, "Primary revision flow should clearly move accepted work into implementation and commit flow");
assert.match(decisionCardSource, /No candidate selection needed/i, "Implementation-forward flow should remove candidate selection requirements");
assert.doesNotMatch(decisionCardSource, /Choose a candidate/, "Decision flow should not ask the operator to choose a candidate");
assert.match(decisionCardSource, /read-only/i, "Decision flow should keep artifact pages read-only in the copy");
assert.match(decisionRouteSource, /revision_direction_selected/, "Decision route should log direction selections durably");
assert.match(decisionRouteSource, /Move forward with the current direction\./, "Legacy design-loop route should still store move-forward language when no candidate is chosen");
assert.match(decisionRouteSource, /revision_another_pass_requested/, "Decision route should log another-pass requests durably");
assert.match(decisionRouteSource, /revision_approved_for_implementation/, "Decision route should log implementation approvals durably");
assert.match(pageSource, /attachmentDocumentIds: payload\.reference_document_ids \?\? \[\]/, "Revision-linked follow-up requests should carry selected attachments into the revision workflow");
assert.match(modalSource, /Message-first intake/, "Follow-up modal should identify the message-first intake flow");
assert.match(modalSource, /Automatic routing/, "Follow-up modal should explain that routing happens automatically");
assert.match(modalSource, /What needs to change\?/, "Follow-up modal should collect the follow-up request as a single message");
assert.match(modalSource, /You don’t need to choose the team or task type up front\./, "Follow-up modal should remove the old branch-picking burden");
assert.match(modalSource, /Delivered work to revise or reference \(optional\)/, "Follow-up modal should allow optional linkage to delivered work");
assert.match(modalSource, /Related stage \(optional\)/, "Follow-up modal should allow optional linkage to a stage");
assert.doesNotMatch(modalSource, /Revise delivered work|Add deliverable|Add support work/, "Follow-up modal should not expose the removed branching labels");
assert.match(modalSource, /revision_source_task_id/, "Revision modal payload should carry the selected delivered task id");
assert.match(taskDetailSource, /Follow-up context/, "Task detail modal should surface follow-up context for message-first tasks");
assert.match(taskDetailSource, /Follow-up mode/, "Task detail modal should show the resolved follow-up mode");
assert.match(taskRouteSource, /metadata\.follow_up_intent = resolvedFollowUpIntent/, "Task creation route should persist the resolved follow-up intent in task metadata");
assert.match(taskRouteSource, /metadata\.intake_mode = "message_first"/, "Task creation route should tag follow-up tasks as message-first intake");
assert.match(taskRouteSource, /metadata\.revision_source_task_id = revisionSourceTaskId/, "Task creation route should persist revision lineage in task metadata");

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

import assert from "node:assert/strict";

import { deriveMilestoneDisplayState } from "../src/lib/project-detail-state.ts";
import { deriveProjectTruth } from "../src/lib/project-truth.ts";

const buildSprint = {
  id: "build-1",
  name: "Build",
  phase_key: "build",
  status: "completed",
  delivery_review_required: true,
  delivery_review_status: "pending",
  approval_gate_required: false,
  approval_gate_status: "not_requested",
};

const milestoneDisplay = deriveMilestoneDisplayState({
  totalTasks: 2,
  doneTasks: 2,
  deliveryReviewStatus: "pending",
  reviewSummary: {
    latestSubmissionId: "submission-1",
    latestRevisionNumber: 1,
    proofItemCount: 2,
    proofCompletenessStatus: "ready",
    latestSubmissionStatus: "pending",
    latestDecision: null,
  },
});

assert.equal(milestoneDisplay.stageState.key, "delivery_review_active", "Completed first-pass delivery should show active QC");
assert.equal(milestoneDisplay.showDecisionActions, true, "First-pass QC should be reviewable");

const truth = deriveProjectTruth({
  project: {
    id: "project-1",
    type: "product_build",
    intake: { githubRepoProvisioning: { status: "ready" } },
    links: { github: "https://github.com/vercel/next.js" },
  },
  sprints: [buildSprint],
  tasks: [
    {
      id: "build-task",
      project_id: "project-1",
      sprint_id: "build-1",
      title: "Ship the build",
      task_type: "build_implementation",
      status: "done",
      review_required: false,
      assignee_agent_id: "agent-1",
    },
    {
      id: "qc-task",
      project_id: "project-1",
      sprint_id: "build-1",
      title: "QC the shipped build",
      task_type: "qa_validation",
      status: "todo",
      review_required: true,
      review_status: "not_requested",
      assignee_agent_id: "agent-2",
    },
  ],
  agents: [
    { id: "agent-1", status: "idle", current_job_id: null },
    { id: "agent-2", status: "idle", current_job_id: null },
  ],
  jobs: [],
});

assert.deepEqual(truth.taskBoard.inProgress, ["qc-task"], "First-pass QC task should move into the active bucket once delivery review is pending");
assert.deepEqual(truth.taskBoard.queued, [], "First-pass QC task should not remain queued");

console.log("verify-first-pass-qc-activation: ok", JSON.stringify({
  stageState: milestoneDisplay.stageState.key,
  checkpointState: milestoneDisplay.checkpointState.key,
  inProgress: truth.taskBoard.inProgress,
  queued: truth.taskBoard.queued,
}, null, 2));

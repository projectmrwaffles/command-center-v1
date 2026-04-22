import assert from "node:assert/strict";
import { deriveProjectTruth } from "../src/lib/project-truth.ts";
import { getTaskExecutionBlocker } from "../src/lib/project-execution.ts";

const project = {
  id: "project-1",
  type: "product_build",
  intake: { shape: "web-app", capabilities: ["frontend"] },
  links: { github: "https://github.com/vercel/next.js" },
};

const sprints = [
  {
    id: "design",
    name: "Design",
    status: "active",
    phase_order: 1,
    approval_gate_required: false,
    approval_gate_status: "not_requested",
  },
  {
    id: "build",
    name: "Build",
    status: "todo",
    phase_key: "build",
    phase_order: 2,
    delivery_review_required: true,
    delivery_review_status: "not_requested",
  },
];

const tasks = [
  {
    id: "design-task",
    project_id: project.id,
    sprint_id: "design",
    title: "Finalize wireframes",
    status: "done",
    assignee_agent_id: "agent-1",
    task_type: "design",
  },
  {
    id: "qa-task",
    project_id: project.id,
    sprint_id: "build",
    title: "QA validation",
    status: "todo",
    assignee_agent_id: "agent-1",
    task_type: "qa_validation",
  },
];

const blocker = getTaskExecutionBlocker({
  project,
  task: tasks[1],
  sprint: sprints[1],
  sprints,
  tasks,
  jobs: [],
  agents: [{ id: "agent-1", status: "idle", current_job_id: null }],
});

assert.equal(blocker, null, "QA task should be runnable once the earlier phase is effectively complete, even if sprint status is stale");

const truth = deriveProjectTruth({
  project,
  tasks,
  sprints,
  jobs: [],
  agents: [{ id: "agent-1", status: "idle", current_job_id: null }],
});

assert.equal(truth.execution.key, "validation_ready", "Project truth should mark QA as ready, not queued, when QA is the next runnable checkpoint");
assert.equal(truth.headline, "QA ready");
assert.match(truth.summary, /next runnable checkpoint/i);
assert.deepEqual(truth.taskBoard.stalled, [], "Runnable QA task should not be held in stalled/blocked state");
assert.ok(truth.taskBoard.queued.includes("qa-task"), "Before dispatch the QA task remains in the queued lane, but it should be runnable");

console.log("verify-qa-runnable-state: ok", JSON.stringify({
  execution: truth.execution,
  headline: truth.headline,
  summary: truth.summary,
  taskBoard: truth.taskBoard,
}, null, 2));

import assert from "node:assert/strict";

const PROJECT_LINK_FIELDS = ["github", "preview", "production", "docs", "figma", "admin"];
const DONE_LIKE = new Set(["done", "cancelled"]);
const ACTIVE_REVIEW_BLOCKERS = new Set(["todo", "in_progress", "blocked"]);

function normalizeUrl(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeProjectLinks(input) {
  if (!input || typeof input !== "object") return null;
  const output = {};
  for (const key of PROJECT_LINK_FIELDS) {
    const value = input[key];
    if (typeof value !== "string") continue;
    const normalized = normalizeUrl(value);
    if (normalized) output[key] = normalized;
  }
  return Object.keys(output).length > 0 ? output : null;
}

function mergeProjectLinks(existing, incoming) {
  const base = sanitizeProjectLinks(existing) || {};
  const next = sanitizeProjectLinks(incoming) || {};
  const merged = { ...base, ...next };
  return Object.keys(merged).length > 0 ? merged : null;
}

function buildReviewRequestSummary({ projectName, sprintName }) {
  return `Review ${sprintName} for ${projectName}`;
}

function buildReviewRequestContext(input) {
  return {
    kind: "project_phase_review",
    sprint_id: input.sprintId,
    sprint_name: input.sprintName,
    project_id: input.projectId,
    project_name: input.projectName,
    links: input.links,
    note: input.note,
  };
}

function getSprintReviewEligibility(input) {
  const taskStatuses = (input.taskStatuses || []).filter((status) => typeof status === "string");
  const totalTasks = taskStatuses.length;
  const doneTasks = taskStatuses.filter((status) => DONE_LIKE.has(status)).length;

  if (!input.approvalGateRequired) {
    return { ok: false, reason: "Milestone is not review-gated", totalTasks, doneTasks };
  }

  if (input.approvalGateStatus === "pending") {
    return { ok: false, reason: "Review request already pending for this milestone", totalTasks, doneTasks };
  }

  if (input.approvalGateStatus === "approved") {
    return { ok: false, reason: "Milestone has already been approved", totalTasks, doneTasks };
  }

  if (totalTasks === 0) {
    return { ok: false, reason: "Milestone needs at least one task before requesting review", totalTasks, doneTasks };
  }

  if (taskStatuses.some((status) => ACTIVE_REVIEW_BLOCKERS.has(status))) {
    return { ok: false, reason: "Finish milestone tasks before requesting review", totalTasks, doneTasks };
  }

  if (doneTasks !== totalTasks) {
    return { ok: false, reason: "Milestone is not complete enough for review", totalTasks, doneTasks };
  }

  return { ok: true, totalTasks, doneTasks };
}

const merged = mergeProjectLinks(
  { docs: "docs.example.com/spec", github: "https://github.com/acme/old" },
  { github: "github.com/acme/new", preview: "preview.example.com/review" },
);
assert.deepEqual(merged, {
  docs: "https://docs.example.com/spec",
  github: "https://github.com/acme/new",
  preview: "https://preview.example.com/review",
});

const summary = buildReviewRequestSummary({ projectName: "Command Center", sprintName: "Phase 2 · Build" });
assert.equal(summary, "Review Phase 2 · Build for Command Center");

const context = buildReviewRequestContext({
  sprintId: "s1",
  sprintName: "Phase 2 · Build",
  projectId: "p1",
  projectName: "Command Center",
  links: merged,
  note: "Ready for QC with GitHub + preview attached.",
});
assert.equal(context.kind, "project_phase_review");
assert.equal(context.sprint_id, "s1");
assert.equal(context.links?.github, "https://github.com/acme/new");
assert.equal(context.note, "Ready for QC with GitHub + preview attached.");

assert.deepEqual(getSprintReviewEligibility({
  approvalGateRequired: true,
  approvalGateStatus: "not_requested",
  taskStatuses: ["done", "cancelled"],
}), { ok: true, totalTasks: 2, doneTasks: 2 });

assert.equal(getSprintReviewEligibility({
  approvalGateRequired: false,
  approvalGateStatus: "not_requested",
  taskStatuses: ["done"],
}).reason, "Milestone is not review-gated");

assert.equal(getSprintReviewEligibility({
  approvalGateRequired: true,
  approvalGateStatus: "pending",
  taskStatuses: ["done"],
}).reason, "Review request already pending for this milestone");

assert.equal(getSprintReviewEligibility({
  approvalGateRequired: true,
  approvalGateStatus: "approved",
  taskStatuses: ["done"],
}).reason, "Milestone has already been approved");

assert.equal(getSprintReviewEligibility({
  approvalGateRequired: true,
  approvalGateStatus: "not_requested",
  taskStatuses: [],
}).reason, "Milestone needs at least one task before requesting review");

assert.equal(getSprintReviewEligibility({
  approvalGateRequired: true,
  approvalGateStatus: "rejected",
  taskStatuses: ["done", "in_progress"],
}).reason, "Finish milestone tasks before requesting review");

console.log("verify-review-request-flow: ok");

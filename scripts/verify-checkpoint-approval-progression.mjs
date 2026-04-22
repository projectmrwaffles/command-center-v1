import assert from "node:assert/strict";
import { finalizeCheckpointApproval } from "../src/lib/checkpoint-approval.ts";
import { getProjectArtifactIntegrity } from "../src/lib/project-artifact-requirements.ts";

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.sort = null;
    this.limitValue = null;
    this.singleMode = null;
    this.updatePayload = null;
    this.selectColumns = null;
    this.insertPayload = null;
  }

  select(columns) {
    this.selectColumns = columns;
    return this;
  }

  update(payload) {
    this.updatePayload = payload;
    return this;
  }

  insert(payload) {
    this.insertPayload = payload;
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => row?.[column] === value);
    return this;
  }

  in(column, values) {
    this.filters.push((row) => values.includes(row?.[column]));
    return this;
  }

  order(column, options = {}) {
    this.sort = { column, ascending: options.ascending !== false };
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  single() {
    this.singleMode = "single";
    return this.execute();
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this.execute();
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    const tableRows = this.db.tables[this.table];
    if (!tableRows) throw new Error(`Unknown table ${this.table}`);

    let rows = tableRows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.sort) {
      const { column, ascending } = this.sort;
      rows = rows.slice().sort((a, b) => {
        if (a?.[column] === b?.[column]) return 0;
        return (a?.[column] < b?.[column] ? -1 : 1) * (ascending ? 1 : -1);
      });
    }
    if (typeof this.limitValue === "number") {
      rows = rows.slice(0, this.limitValue);
    }

    if (this.insertPayload) {
      const payloads = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload];
      const inserted = payloads.map((payload) => ({ ...payload }));
      this.db.tables[this.table].push(...inserted);
      if (this.singleMode === "single") return { data: inserted[0] ?? null, error: null };
      if (this.singleMode === "maybeSingle") return { data: inserted[0] ?? null, error: null };
      return { data: inserted, error: null };
    }

    if (this.updatePayload) {
      for (const row of rows) Object.assign(row, this.updatePayload);
      if (this.singleMode === "single") return { data: rows[0] ?? null, error: null };
      if (this.singleMode === "maybeSingle") return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    if (this.singleMode === "single") {
      return { data: rows[0] ?? null, error: rows.length ? null : { message: `No ${this.table} row found` } };
    }
    if (this.singleMode === "maybeSingle") {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }
}

class MockDb {
  constructor(tables) {
    this.tables = tables;
  }

  from(table) {
    return new Query(this, table);
  }
}

const db = new MockDb({
  projects: [
    {
      id: "project-1",
      name: "PRD-gated fresh project",
      type: "web_app",
      intake: {
        requirements: {
          technologyRequirements: [{ kind: "framework", value: "Next.js", constraint: "required" }],
          sources: [{ type: "prd_pdf", evidence: ["upload"] }],
        },
      },
      links: { github: "https://github.com/acme-inc/command-center-app" },
      github_repo_binding: {
        provider: "github",
        owner: "acme-inc",
        repo: "command-center-app",
        fullName: "acme-inc/command-center-app",
        url: "https://github.com/acme-inc/command-center-app",
        source: "linked",
        linkedAt: "2026-04-09T00:00:00.000Z",
        projectLinkKey: "github",
      },
    },
  ],
  sprints: [
    {
      id: "build-1",
      project_id: "project-1",
      name: "Phase 2 · Build",
      status: "active",
      phase_order: 2,
      approval_gate_required: true,
      approval_gate_status: "pending",
      created_at: "2026-04-09T00:00:00.000Z",
    },
    {
      id: "validate-1",
      project_id: "project-1",
      name: "Phase 3 · Validate",
      status: "draft",
      phase_order: 3,
      approval_gate_required: false,
      approval_gate_status: "not_requested",
      created_at: "2026-04-09T00:10:00.000Z",
    },
  ],
  sprint_items: [
    {
      id: "task-build-review",
      project_id: "project-1",
      sprint_id: "build-1",
      title: "Build milestone review",
      status: "done",
      review_required: true,
      review_status: "pending",
      position: 1,
    },
    {
      id: "task-build-impl",
      project_id: "project-1",
      sprint_id: "build-1",
      title: "Implement first slice",
      status: "done",
      review_required: false,
      position: 2,
    },
  ],
  jobs: [],
  agents: [],
  agent_events: [],
  milestone_submissions: [],
  proof_bundles: [],
  proof_items: [],
});

const artifactIntegrity = getProjectArtifactIntegrity(db.tables.projects[0], db.tables.sprint_items.filter((row) => row.sprint_id === "build-1"));
assert.equal(artifactIntegrity.blockingReason, null, `fixture must represent a repo-backed project without artifact blockers: ${artifactIntegrity.blockingReason}`);

const result = await finalizeCheckpointApproval(db, {
  projectId: "project-1",
  milestoneId: "build-1",
  decidedAt: "2026-04-09T21:45:00.000Z",
});

const buildSprint = db.tables.sprints.find((row) => row.id === "build-1");
const validateSprint = db.tables.sprints.find((row) => row.id === "validate-1");
const reviewTask = db.tables.sprint_items.find((row) => row.id === "task-build-review");

assert.equal(buildSprint.status, "completed", "approved gated sprint should complete immediately once all tasks are done");
assert.equal(buildSprint.approval_gate_status, "approved", "checkpoint approval should persist on the sprint");
assert.equal(validateSprint.status, "active", "next sprint should activate instead of remaining stalled in draft");
assert.equal(reviewTask.status, "done", "review task should remain done after checkpoint approval");
assert.equal(reviewTask.review_status, "approved", "review task should record approval status");
assert.equal(result.progression?.advanced, true, "checkpoint approval should trigger phase reconciliation");
assert.equal(result.progression?.previousSprintId, "build-1");
assert.equal(result.progression?.nextSprintId, "validate-1");

const buildPrecheckDb = new MockDb({
  projects: [{ id: "project-2", name: "Build precheck", type: "web_app", intake: {}, links: {}, github_repo_binding: null }],
  sprints: [
    {
      id: "build-precheck",
      project_id: "project-2",
      name: "Phase 2 · Build",
      status: "active",
      phase_key: "build",
      checkpoint_type: "prebuild_checkpoint",
      approval_gate_required: true,
      approval_gate_status: "pending",
      delivery_review_required: true,
      delivery_review_status: "not_requested",
      created_at: "2026-04-09T00:00:00.000Z",
    },
  ],
  sprint_items: [
    {
      id: "task-precheck-review",
      project_id: "project-2",
      sprint_id: "build-precheck",
      title: "Build precheck review",
      status: "done",
      review_required: true,
      review_status: "pending",
      position: 1,
    },
  ],
  jobs: [],
  agents: [],
  agent_events: [],
  milestone_submissions: [],
  proof_bundles: [],
  proof_items: [],
});

await finalizeCheckpointApproval(buildPrecheckDb, {
  projectId: "project-2",
  milestoneId: "build-precheck",
  decidedAt: "2026-04-09T21:45:00.000Z",
  reviewKind: "approval_gate",
});

const buildPrecheckSprint = buildPrecheckDb.tables.sprints.find((row) => row.id === "build-precheck");
assert.equal(buildPrecheckSprint.approval_gate_status, "approved", "pre-build checkpoint should approve the approval gate status");
assert.equal(buildPrecheckSprint.delivery_review_status, "not_requested", "pre-build checkpoint approval must not mutate delivery review status");

const deliveryReviewDb = new MockDb({
  projects: [{ id: "project-3", name: "Delivery review completion", type: "web_app", intake: {}, links: { preview: "https://preview.example.com", github: "https://github.com/acme-inc/command-center-app" }, github_repo_binding: null }],
  sprints: [
    {
      id: "build-review",
      project_id: "project-3",
      name: "Phase 2 · Build",
      status: "active",
      phase_order: 2,
      phase_key: "build",
      checkpoint_type: "delivery_review",
      approval_gate_required: false,
      approval_gate_status: "not_requested",
      delivery_review_required: true,
      delivery_review_status: "pending",
      created_at: "2026-04-09T00:00:00.000Z",
    },
    {
      id: "launch-next",
      project_id: "project-3",
      name: "Phase 3 · Launch",
      status: "draft",
      phase_order: 3,
      created_at: "2026-04-09T00:10:00.000Z",
    },
  ],
  sprint_items: [
    {
      id: "task-delivery-review",
      project_id: "project-3",
      sprint_id: "build-review",
      title: "QC delivered build",
      status: "done",
      review_required: true,
      review_status: "pending",
      position: 1,
    },
    {
      id: "task-delivery-impl",
      project_id: "project-3",
      sprint_id: "build-review",
      title: "Ship feature slice",
      status: "done",
      review_required: false,
      position: 2,
    },
  ],
  jobs: [],
  agents: [],
  agent_events: [],
  milestone_submissions: [
    {
      id: "submission-approved-1",
      sprint_id: "build-review",
      status: "approved",
      revision_number: 1,
      checkpoint_type: "delivery_review",
      evidence_requirements: null,
    },
  ],
  proof_bundles: [],
  proof_items: [],
});

const deliveryReviewResult = await finalizeCheckpointApproval(deliveryReviewDb, {
  projectId: "project-3",
  milestoneId: "build-review",
  decidedAt: "2026-04-09T21:45:00.000Z",
  reviewKind: "delivery_review",
});

const completedBuildSprint = deliveryReviewDb.tables.sprints.find((row) => row.id === "build-review");
const activatedLaunchSprint = deliveryReviewDb.tables.sprints.find((row) => row.id === "launch-next");
const approvedReviewTask = deliveryReviewDb.tables.sprint_items.find((row) => row.id === "task-delivery-review");
assert.equal(completedBuildSprint.delivery_review_status, "approved", "delivery review approval should persist on the build sprint");
assert.equal(completedBuildSprint.status, "completed", "approved build sprint should complete instead of reopening another revision step");
assert.equal(activatedLaunchSprint.status, "active", "next sprint should activate once QC approves with no requested changes");
assert.equal(approvedReviewTask.review_status, "approved", "QC task should be marked approved after delivery review approval");
assert.equal(deliveryReviewResult.progression?.advanced, true, "delivery review approval should advance project progression");
assert.equal(deliveryReviewDb.tables.milestone_submissions.length, 1, "approved delivery review should not auto-create a follow-up revision submission when QC requested no changes");

console.log("PASS checkpoint approval advances the next sprint after PRD-gated build approval");
console.log("PASS build pre-build checkpoint approval stays separate from delivery review status");
console.log("PASS approved delivery review does not force a follow-up revision cycle before build completion");

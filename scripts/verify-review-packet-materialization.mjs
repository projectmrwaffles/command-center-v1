import assert from "node:assert/strict";
import { maybeAdvanceProjectAfterTaskDone, reconcileProjectPhaseProgression } from "../src/lib/project-handoff.ts";
import { buildProjectTruth } from "../src/lib/project-truth.ts";

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.sort = null;
    this.limitValue = null;
    this.singleMode = null;
    this.updatePayload = null;
    this.insertPayload = null;
  }

  select() { return this; }
  update(payload) { this.updatePayload = payload; return this; }
  insert(payload) { this.insertPayload = payload; return this; }
  eq(column, value) { this.filters.push((row) => row?.[column] === value); return this; }
  in(column, values) { this.filters.push((row) => values.includes(row?.[column])); return this; }
  order(column, options = {}) { this.sort = { column, ascending: options.ascending !== false }; return this; }
  limit(value) { this.limitValue = value; return this; }
  single() { this.singleMode = "single"; return this.execute(); }
  maybeSingle() { this.singleMode = "maybeSingle"; return this.execute(); }
  not(column, operator, value) {
    this.filters.push((row) => {
      if (operator === "like") return row?.[column] !== value;
      if (operator === "is" && value === null) return row?.[column] !== null && row?.[column] !== undefined;
      return true;
    });
    return this;
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }

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
    if (typeof this.limitValue === "number") rows = rows.slice(0, this.limitValue);

    if (this.insertPayload) {
      const payloads = (Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload]).map((payload, index) => ({
        id: payload.id ?? `${this.table}-${this.db.tables[this.table].length + index + 1}`,
        ...payload,
      }));
      this.db.tables[this.table].push(...payloads);
      if (this.singleMode === "single" || this.singleMode === "maybeSingle") return { data: payloads[0] ?? null, error: null };
      return { data: payloads, error: null };
    }

    if (this.updatePayload) {
      for (const row of rows) Object.assign(row, this.updatePayload);
      if (this.singleMode === "single" || this.singleMode === "maybeSingle") return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    if (this.singleMode === "single") return { data: rows[0] ?? null, error: rows.length ? null : { message: `No ${this.table} row found` } };
    if (this.singleMode === "maybeSingle") return { data: rows[0] ?? null, error: null };
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

function createSeed({ projectId, projectName, projectType, projectLinks = {}, sprint, tasks, extraSprints = [] }) {
  return {
    projects: [{ id: projectId, name: projectName, type: projectType, intake: {}, links: projectLinks, github_repo_binding: null }],
    sprints: [sprint, ...extraSprints],
    sprint_items: tasks,
    jobs: [],
    agents: [],
    milestone_submissions: [],
    proof_bundles: [],
    proof_items: [],
    agent_events: [],
    agent_notifications: [],
  };
}

{
  const db = new MockDb(createSeed({
    projectId: "project-validate",
    projectName: "Kickoff validate repro",
    projectType: "web_app",
    projectLinks: { github: "https://github.com/acme/kickoff-validate" },
    sprint: {
      id: "sprint-validate",
      project_id: "project-validate",
      name: "Phase 2 · Validate",
      status: "active",
      phase_key: "validate",
      phase_order: 2,
      approval_gate_required: false,
      approval_gate_status: "not_requested",
      checkpoint_type: "acceptance_review",
      checkpoint_evidence_requirements: null,
      created_at: "2026-04-10T22:00:00.000Z",
    },
    extraSprints: [{
      id: "sprint-build",
      project_id: "project-validate",
      name: "Phase 3 · Build",
      status: "draft",
      phase_key: "build",
      phase_order: 3,
      approval_gate_required: false,
      approval_gate_status: "not_requested",
      delivery_review_required: true,
      delivery_review_status: "not_requested",
      created_at: "2026-04-10T22:30:00.000Z",
    }],
    tasks: [{
      id: "task-validate-review",
      project_id: "project-validate",
      sprint_id: "sprint-validate",
      title: "Validate kickoff deliverables",
      status: "done",
      review_required: true,
      review_status: "pending",
      task_type: "qa_validation",
      updated_at: "2026-04-10T22:15:00.000Z",
      position: 1,
    }],
  }));

  const result = await maybeAdvanceProjectAfterTaskDone(db, { projectId: "project-validate", completedTaskId: "task-validate-review" });

  assert.equal(result.reason, "review_submission_created");
  assert.equal(result.advanced, false);
  assert.equal(db.tables.milestone_submissions.length, 1, "kickoff validate completion path should create a milestone submission");
  assert.equal(db.tables.sprints.find((s) => s.id === "sprint-validate")?.approval_gate_status, "pending", "kickoff validate sprint should move to pending review");
  assert.equal(db.tables.sprints.find((s) => s.id === "sprint-validate")?.status, "active", "kickoff validate sprint should stay active pending review");
  assert.equal(db.tables.sprints.find((s) => s.id === "sprint-build")?.status, "draft", "next sprint should not activate before review");

  console.log("PASS kickoff validate handoff creates a review submission instead of advancing to the following sprint");
}

{
  const db = new MockDb(createSeed({
    projectId: "project-message",
    projectName: "Kickoff message repro",
    projectType: "marketing_growth",
    sprint: {
      id: "sprint-message",
      project_id: "project-message",
      name: "Phase 2 · Message",
      status: "active",
      phase_key: "message",
      phase_order: 2,
      approval_gate_required: false,
      approval_gate_status: "not_requested",
      checkpoint_type: "content_review",
      checkpoint_evidence_requirements: null,
      created_at: "2026-04-10T22:00:00.000Z",
    },
    tasks: [{
      id: "task-message-review",
      project_id: "project-message",
      sprint_id: "sprint-message",
      title: "Draft launch-ready messaging",
      status: "done",
      review_required: true,
      review_status: "pending",
      task_type: "content_messaging",
      updated_at: "2026-04-10T22:15:00.000Z",
      position: 1,
    }],
  }));

  const result = await maybeAdvanceProjectAfterTaskDone(db, { projectId: "project-message", completedTaskId: "task-message-review" });

  assert.equal(result.reason, "review_submission_created");
  assert.equal(result.advanced, false);
  assert.equal(db.tables.milestone_submissions.length, 1, "final kickoff message completion path should create a milestone submission");
  assert.equal(db.tables.milestone_submissions[0]?.checkpoint_type, "content_review");
  assert.equal(db.tables.sprints[0].approval_gate_status, "pending", "final kickoff message sprint should move to pending review");
  assert.equal(db.tables.sprints[0].status, "active", "final kickoff message sprint should stay active pending review");

  console.log("PASS kickoff message handoff creates a review submission instead of finishing the phase");
}

{
  const db = new MockDb(createSeed({
    projectId: "project-reconcile",
    projectName: "Reconcile validate repro",
    projectType: "web_app",
    projectLinks: { github: "https://github.com/acme/reconcile-validate" },
    sprint: {
      id: "sprint-reconcile",
      project_id: "project-reconcile",
      name: "Phase 2 · Validate",
      status: "active",
      phase_key: "validate",
      phase_order: 2,
      approval_gate_required: false,
      approval_gate_status: "not_requested",
      checkpoint_type: "acceptance_review",
      checkpoint_evidence_requirements: null,
      created_at: "2026-04-10T22:00:00.000Z",
    },
    tasks: [{
      id: "task-reconcile-review",
      project_id: "project-reconcile",
      sprint_id: "sprint-reconcile",
      title: "Validate delivered flow",
      status: "done",
      review_required: true,
      review_status: "pending",
      task_type: "qa_validation",
      updated_at: "2026-04-10T22:15:00.000Z",
      position: 1,
    }],
  }));

  const result = await reconcileProjectPhaseProgression(db, { projectId: "project-reconcile" });

  assert.equal(result.reason, "review_submission_created");
  assert.equal(db.tables.milestone_submissions.length, 1, "reconcile path should also respect task-level review gating");
  assert.equal(db.tables.sprints[0].approval_gate_status, "pending");

  console.log("PASS reconcile path also creates a review submission for task-level kickoff review gates");
}

{
  const tables = createSeed({
    projectId: "project-capacity",
    projectName: "Worker capacity repro",
    projectType: "product_build",
    sprint: {
      id: "sprint-capacity",
      project_id: "project-capacity",
      name: "Phase 2 · Validate",
      status: "active",
      phase_key: "validate",
      phase_order: 2,
      approval_gate_required: false,
      approval_gate_status: "not_requested",
      checkpoint_type: "acceptance_review",
      checkpoint_evidence_requirements: null,
      created_at: "2026-04-10T22:00:00.000Z",
    },
    tasks: [{
      id: "task-queued-capacity",
      project_id: "project-capacity",
      sprint_id: "sprint-capacity",
      title: "Acceptance Review For Worker capacity repro",
      status: "todo",
      review_required: true,
      review_status: "pending",
      task_type: "qa_validation",
      assignee_agent_id: "qa-agent",
      updated_at: "2026-04-10T22:20:00.000Z",
      position: 1,
    }],
  });
  tables.agents = [{ id: "qa-agent", status: "active", current_job_id: "job-other" }];
  tables.jobs = [{
    id: "job-other",
    owner_agent_id: "qa-agent",
    project_id: "project-capacity",
    status: "in_progress",
    summary: "task:some-other-task",
    updated_at: "2026-04-10T22:21:00.000Z",
  }];
  const db = new MockDb(tables);

  const truth = buildProjectTruth({
    project: tables.projects[0],
    sprints: tables.sprints,
    tasks: tables.sprint_items,
    jobs: tables.jobs,
    agents: tables.agents,
  });

  assert.deepEqual(truth.taskBoard.queued, ["task-queued-capacity"], "capacity-blocked todo tasks should stay in queued lane");
  assert.deepEqual(truth.taskBoard.stalled, [], "capacity-blocked todo tasks should not render as stalled");

  console.log("PASS worker-capacity queued tasks stay in queued lane instead of stalled");
}

{
  const db = new MockDb(createSeed({
    projectId: "project-build-delivery-followup",
    projectName: "Build delivery followup repro",
    projectType: "product_build",
    sprint: {
      id: "sprint-build-followup",
      project_id: "project-build-delivery-followup",
      name: "Phase 2 · Build",
      status: "active",
      phase_key: "build",
      phase_order: 2,
      approval_gate_required: true,
      approval_gate_status: "approved",
      delivery_review_required: true,
      delivery_review_status: "not_requested",
      checkpoint_type: "delivery_review",
      checkpoint_evidence_requirements: null,
      created_at: "2026-04-10T22:00:00.000Z",
    },
    tasks: [{
      id: "task-build-followup",
      project_id: "project-build-delivery-followup",
      sprint_id: "sprint-build-followup",
      title: "Ship implementation slice",
      status: "done",
      review_required: true,
      review_status: "not_requested",
      task_type: "build_implementation",
      updated_at: "2026-04-10T22:15:00.000Z",
      position: 1,
    }],
  }));
  db.tables.milestone_submissions.push({
    id: "submission-prebuild-approved",
    sprint_id: "sprint-build-followup",
    status: "approved",
    revision_number: 1,
    checkpoint_type: "prebuild_checkpoint",
  });

  const result = await maybeAdvanceProjectAfterTaskDone(db, { projectId: "project-build-delivery-followup", completedTaskId: "task-build-followup" });

  assert.equal(result.reason, "review_submission_created");
  assert.equal(db.tables.milestone_submissions.length, 2, "build completion should create a new delivery review even when an approved prebuild checkpoint already exists");
  assert.equal(db.tables.milestone_submissions[1]?.checkpoint_type, "delivery_review");

  console.log("PASS approved prebuild checkpoints do not suppress required build delivery review submissions");
}

{
  const db = new MockDb(createSeed({
    projectId: "project-existing-delivery-review-bundle-gap",
    projectName: "Existing delivery review gap repro",
    projectType: "product_build",
    sprint: {
      id: "sprint-existing-delivery-review-gap",
      project_id: "project-existing-delivery-review-bundle-gap",
      name: "Phase 2 · Build",
      status: "active",
      phase_key: "build",
      phase_order: 2,
      approval_gate_required: true,
      approval_gate_status: "approved",
      delivery_review_required: true,
      delivery_review_status: "not_requested",
      checkpoint_type: "delivery_review",
      checkpoint_evidence_requirements: {
        screenshotRequired: true,
        minScreenshotCount: 1,
        requiredEvidenceKinds: ["screenshot", "staging_url", "github_pr", "commit", "loom"],
        requiredEvidenceKindsMode: "any",
      },
      created_at: "2026-04-10T22:00:00.000Z",
    },
    tasks: [{
      id: "task-existing-delivery-review-gap",
      project_id: "project-existing-delivery-review-bundle-gap",
      sprint_id: "sprint-existing-delivery-review-gap",
      title: "Ship implementation slice",
      status: "done",
      review_required: true,
      review_status: "not_requested",
      task_type: "build_implementation",
      updated_at: "2026-04-10T22:15:00.000Z",
      position: 1,
    }],
  }));
  db.tables.milestone_submissions.push({
    id: "submission-existing-delivery-review-gap",
    sprint_id: "sprint-existing-delivery-review-gap",
    status: "submitted",
    revision_number: 1,
    checkpoint_type: "delivery_review",
  });

  const result = await maybeAdvanceProjectAfterTaskDone(db, { projectId: "project-existing-delivery-review-bundle-gap", completedTaskId: "task-existing-delivery-review-gap" });

  assert.equal(result.reason, "review_submission_created");
  assert.equal(db.tables.milestone_submissions.length, 2, "delivery review should regenerate when the existing submission has no usable proof bundle");
  assert.equal(db.tables.milestone_submissions[1]?.checkpoint_type, "delivery_review");

  console.log("PASS incomplete existing delivery review submissions do not block regenerated review packets");
}

{
  const { fetchPendingTasks } = await import("../scripts/agent-listener.js");
  const tables = createSeed({
    projectId: "project-pending-filter",
    projectName: "Pending filter repro",
    projectType: "product_build",
    sprint: {
      id: "sprint-active",
      project_id: "project-pending-filter",
      name: "Phase 2 · Validate",
      status: "active",
      phase_key: "validate",
      phase_order: 2,
      created_at: "2026-04-10T22:00:00.000Z",
    },
    extraSprints: [{
      id: "sprint-draft",
      project_id: "project-pending-filter",
      name: "Phase 3 · QA",
      status: "draft",
      phase_key: "qa",
      phase_order: 3,
      created_at: "2026-04-10T22:30:00.000Z",
    }],
    tasks: [
      {
        id: "task-active",
        project_id: "project-pending-filter",
        sprint_id: "sprint-active",
        title: "Active sprint task",
        status: "todo",
        assignee_agent_id: "qa-agent",
        created_at: "2026-04-10T22:20:00.000Z",
      },
      {
        id: "task-draft",
        project_id: "project-pending-filter",
        sprint_id: "sprint-draft",
        title: "Draft sprint task",
        status: "todo",
        assignee_agent_id: "qa-agent",
        created_at: "2026-04-10T22:25:00.000Z",
      }
    ],
  });
  const db = new MockDb(tables);
  const originalExecute = Query.prototype.execute;
  Query.prototype.execute = async function patchedExecute() {
    if (this.table === "sprint_items") {
      const base = await originalExecute.call(this);
      const rows = Array.isArray(base.data) ? base.data : [];
      const activeOnly = this.filters.some((filter) => String(filter).includes("sprints"));
      if (!activeOnly) return base;
      return {
        data: rows.filter((row) => tables.sprints.find((s) => s.id === row.sprint_id)?.status === "active").map((row) => ({
          ...row,
          sprints: tables.sprints.find((s) => s.id === row.sprint_id) || null,
        })),
        error: null,
      };
    }
    return originalExecute.call(this);
  };
  const pending = await fetchPendingTasks(db, "qa-agent");
  Query.prototype.execute = originalExecute;

  assert.deepEqual(pending.map((task) => task.id), ["task-active"], "listener should ignore draft/future-sprint todo tasks during reconcile fetch");

  console.log("PASS listener pending-task reconcile ignores non-active sprint tasks");
}

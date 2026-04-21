import assert from "node:assert/strict";
import { ensureMilestoneReviewSubmission } from "../src/lib/review-submission.ts";
import { syncMilestoneReviewRequest } from "../src/lib/review-request-sync.ts";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.sort = null;
    this.limitValue = null;
    this.updatePayload = null;
    this.insertPayload = null;
    this.singleMode = null;
  }
  select() { return this; }
  eq(column, value) { this.filters.push((row) => row?.[column] === value); return this; }
  in(column, values) { this.filters.push((row) => values.includes(row?.[column])); return this; }
  not(column, operator, value) {
    this.filters.push((row) => {
      if (operator === "is" && value === null) return row?.[column] !== null && row?.[column] !== undefined;
      return true;
    });
    return this;
  }
  order(column, options = {}) { this.sort = { column, ascending: options.ascending !== false }; return this; }
  limit(value) { this.limitValue = value; return this; }
  update(payload) { this.updatePayload = payload; return this; }
  insert(payload) { this.insertPayload = payload; return this; }
  single() { this.singleMode = "single"; return this.execute(); }
  maybeSingle() { this.singleMode = "maybeSingle"; return this.execute(); }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  async execute() {
    const tableRows = this.db.tables[this.table] || [];
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
        id: payload.id ?? `${this.table}-${this.db.nextId++}-${index + 1}`,
        ...clone(payload),
      }));
      if (!this.db.tables[this.table]) this.db.tables[this.table] = [];
      this.db.tables[this.table].push(...payloads);
      if (this.singleMode) return { data: payloads[0] ?? null, error: null };
      return { data: payloads, error: null };
    }
    if (this.updatePayload) {
      for (const row of rows) Object.assign(row, clone(this.updatePayload));
      if (this.singleMode) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }
    if (this.singleMode === "single") return { data: rows[0] ?? null, error: rows[0] ? null : { message: `No ${this.table} row found` } };
    if (this.singleMode === "maybeSingle") return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
}

class MockDb {
  constructor(tables) { this.tables = tables; this.nextId = 1; }
  from(table) { return new Query(this, table); }
  async rpc(fn, args) {
    assert.equal(fn, "create_project_review_request");
    const approval = {
      id: `approval-${this.nextId++}`,
      project_id: args.p_project_id,
      sprint_id: args.p_sprint_id,
      job_id: `job-${this.nextId++}`,
      summary: args.p_approval_summary,
      status: "pending",
      context: args.p_context,
      created_at: "2026-04-21T18:30:00.000Z",
    };
    const job = {
      id: approval.job_id,
      project_id: args.p_project_id,
      owner_agent_id: args.p_owner_agent_id,
      title: args.p_title,
      status: "queued",
      updated_at: "2026-04-21T18:30:00.000Z",
    };
    this.tables.approvals.push(approval);
    this.tables.jobs.push(job);
    return {
      data: [{
        approval_id: approval.id,
        approval_status: approval.status,
        approval_summary: approval.summary,
        approval_sprint_id: approval.sprint_id,
        approval_context: approval.context,
        job_id: job.id,
        job_title: job.title,
        job_status: job.status,
        links: approval.context?.links ?? null,
      }],
      error: null,
    };
  }
}

const now = "2026-04-21T18:00:00.000Z";
const db = new MockDb({
  projects: [{ id: "p1", name: "Command Center", type: "web_app", intake: { shape: "web-app", capabilities: ["frontend"] }, links: { preview: "https://example.com/review", github: "https://github.com/acme/cc" }, github_repo_binding: { url: "https://github.com/acme/cc" } }],
  sprints: [{ id: "build-1", project_id: "p1", name: "Phase 2 · Build", phase_key: "build", status: "active", approval_gate_required: false, approval_gate_status: "approved", delivery_review_required: true, delivery_review_status: "not_requested", checkpoint_type: "delivery_review", checkpoint_evidence_requirements: null, created_at: now }],
  sprint_items: [{ id: "task-1", project_id: "p1", sprint_id: "build-1", title: "Ship build slice", status: "done", task_type: "build_implementation", review_required: true, assignee_agent_id: "agent-1", updated_at: now }],
  milestone_submissions: [],
  proof_bundles: [],
  proof_items: [],
  approvals: [],
  jobs: [],
  agents: [{ id: "agent-1" }],
  agent_events: [{ id: "evt-1", project_id: "p1", event_type: "task_completed", timestamp: now, payload: { task_id: "task-1", title: "Ship build slice", raw_result: "Preview `https://example.com/review` screenshot `/tmp/review-proof.png` commit `abcdef1`" } }],
});

const submission = await ensureMilestoneReviewSubmission(db, {
  projectId: "p1",
  sprintId: "build-1",
  sprintName: "Phase 2 · Build",
  tasks: db.tables.sprint_items,
  completionEvents: db.tables.agent_events,
});

assert.ok(submission?.id, "auto submission should exist");
assert.equal(db.tables.proof_bundles[0]?.completeness_status, "ready", "ready evidence should materialize a ready proof bundle");
assert.equal(db.tables.approvals.length, 1, "ready auto delivery review should create a real approval request");
assert.equal(db.tables.jobs.length, 1, "ready auto delivery review should create a real QC job");
assert.equal(db.tables.sprints[0].delivery_review_status, "pending", "delivery review state should stay aligned with the real pending request");

const repeat = await syncMilestoneReviewRequest(db, { projectId: "p1", sprintId: "build-1" });
assert.equal(repeat.created, false, "sync should be idempotent once a pending approval exists");
assert.equal(repeat.reason, "already_pending");

const pendingReview = db.tables.approvals.find((approval) => approval.sprint_id === "build-1" && approval.status === "pending") || null;
const latestSubmission = db.tables.milestone_submissions.find((row) => row.sprint_id === "build-1") || null;
assert.ok(pendingReview, "project detail data should include a pending reviewRequest");
assert.ok(latestSubmission, "project detail data should include reviewSummary from the latest submission");

console.log("PASS auto delivery review sync creates approval/job workflow and leaves both reviewSummary and reviewRequest available for project detail");

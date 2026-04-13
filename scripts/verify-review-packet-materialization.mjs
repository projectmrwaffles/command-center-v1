import assert from "node:assert/strict";
import { maybeAdvanceProjectAfterTaskDone, reconcileProjectPhaseProgression } from "../src/lib/project-handoff.ts";

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

  select() {
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

function createSeed() {
  return {
    projects: [
      {
        id: "project-validate",
        name: "Validate packet repro",
        type: "web_app",
        intake: {},
        links: { github: "https://github.com/acme/validate-packet" },
        github_repo_binding: {
          provider: "github",
          owner: "acme",
          repo: "validate-packet",
          fullName: "acme/validate-packet",
          url: "https://github.com/acme/validate-packet",
          source: "linked",
        },
      },
    ],
    sprints: [
      {
        id: "sprint-validate",
        project_id: "project-validate",
        name: "Phase 3 · Validate",
        status: "active",
        phase_order: 3,
        approval_gate_required: true,
        approval_gate_status: "not_requested",
        checkpoint_type: "delivery_review",
        checkpoint_evidence_requirements: null,
        created_at: "2026-04-10T22:00:00.000Z",
      },
    ],
    sprint_items: [
      {
        id: "task-validate-review",
        project_id: "project-validate",
        sprint_id: "sprint-validate",
        title: "Validate delivered flow",
        status: "done",
        review_required: true,
        review_status: "pending",
        task_type: "qa_validation",
        updated_at: "2026-04-10T22:15:00.000Z",
        position: 1,
      },
    ],
    jobs: [],
    agents: [],
    milestone_submissions: [],
    proof_bundles: [],
    proof_items: [],
    agent_events: [],
  };
}

{
  const db = new MockDb(createSeed());
  const result = await maybeAdvanceProjectAfterTaskDone(db, {
    projectId: "project-validate",
    completedTaskId: "task-validate-review",
  });

  assert.equal(result.reason, "review_submission_created");
  assert.equal(db.tables.milestone_submissions.length, 1, "completion path should materialize a review submission");
  assert.equal(db.tables.proof_bundles.length, 1, "completion path should materialize a proof bundle");
  assert.equal(db.tables.proof_items.length, 1, "completion path should materialize proof items from done tasks");
  assert.equal(db.tables.proof_bundles[0]?.completeness_status, "incomplete", "note-only auto packets must stay incomplete until real deliverable evidence is attached");
  assert.equal(db.tables.sprints[0].approval_gate_status, "pending", "checkpoint gate should move into pending review");
  assert.equal(db.tables.sprints[0].status, "active", "gated sprint should stay active until review decision");

  console.log("PASS task completion creates an incomplete review packet when only generic task notes exist");
}

{
  const db = new MockDb(createSeed());
  const result = await reconcileProjectPhaseProgression(db, {
    projectId: "project-validate",
  });

  assert.equal(result.reason, "review_submission_created");
  assert.equal(db.tables.milestone_submissions.length, 1, "reconcile path should also create a submission from rendered state");
  assert.equal(db.tables.proof_bundles[0]?.completeness_status, "incomplete");
  assert.equal(db.tables.proof_items[0]?.label, "Validate delivered flow");

  console.log("PASS project reconciliation backfills the same incomplete packet from stored sprint state");
}

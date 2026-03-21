import assert from "node:assert/strict";
import { maybeAdvanceProjectAfterTaskDone } from "../src/lib/project-handoff.ts";
import { syncProjectState } from "../src/lib/project-state.ts";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDb(tables) {
  return {
    tables,
    from(table) {
      return createQuery(this.tables, table);
    },
  };
}

function createQuery(tables, table) {
  const state = { filters: [], orderBy: null, limitCount: null, pendingUpdate: null, pendingInsert: null, pendingDelete: false, selectClause: null };
  const api = {
    select(selectClause) {
      state.selectClause = selectClause;
      return api;
    },
    eq(column, value) {
      state.filters.push((row) => row?.[column] === value);
      return api;
    },
    in(column, values) {
      state.filters.push((row) => values.includes(row?.[column]));
      return api;
    },
    not(column, op, value) {
      if (op === "is" && value === null) state.filters.push((row) => row?.[column] !== null && row?.[column] !== undefined);
      return api;
    },
    order(column, { ascending = true } = {}) {
      state.orderBy = { column, ascending };
      return api;
    },
    limit(count) {
      state.limitCount = count;
      return api;
    },
    update(payload) {
      state.pendingUpdate = payload;
      return api;
    },
    insert(payload) {
      state.pendingInsert = payload;
      return api;
    },
    delete() {
      state.pendingDelete = true;
      return api;
    },
    async maybeSingle() {
      const rows = apply();
      return { data: rows[0] ?? null, error: null };
    },
    async single() {
      const rows = apply();
      return { data: rows[0] ?? null, error: rows[0] ? null : { message: `No row in ${table}` } };
    },
    then(resolve, reject) {
      return Promise.resolve({ data: apply(), error: null }).then(resolve, reject);
    },
  };

  function applyFilters(rows) {
    let next = rows.filter((row) => state.filters.every((filter) => filter(row)));
    if (state.orderBy) {
      const { column, ascending } = state.orderBy;
      next = next.slice().sort((a, b) => {
        const av = a?.[column] ?? 0;
        const bv = b?.[column] ?? 0;
        return ascending ? (av > bv ? 1 : av < bv ? -1 : 0) : (av < bv ? 1 : av > bv ? -1 : 0);
      });
    }
    if (typeof state.limitCount === "number") next = next.slice(0, state.limitCount);
    return next;
  }

  function apply() {
    const rows = tables[table] || [];
    const matched = applyFilters(rows);

    if (state.pendingUpdate) {
      for (const row of rows) {
        if (state.filters.every((filter) => filter(row))) Object.assign(row, clone(state.pendingUpdate));
      }
      return applyFilters(rows);
    }

    if (state.pendingInsert) {
      const inserted = Array.isArray(state.pendingInsert) ? state.pendingInsert.map(clone) : [clone(state.pendingInsert)];
      tables[table].push(...inserted);
      return inserted;
    }

    if (state.pendingDelete) {
      tables[table] = rows.filter((row) => !state.filters.every((filter) => filter(row)));
      return matched;
    }

    return matched;
  }

  return api;
}

const now = new Date().toISOString();
const db = createDb({
  projects: [{
    id: "p1",
    name: "Artifact Integrity Repro",
    status: "active",
    type: "product_build",
    intake: { shape: "web-app", capabilities: ["frontend"] },
    links: null,
    github_repo_binding: null,
    progress_pct: 0,
    updated_at: now,
  }],
  sprints: [
    { id: "s1", project_id: "p1", name: "Build", status: "active", phase_order: 1, approval_gate_required: true, approval_gate_status: "not_requested", created_at: now },
    { id: "s2", project_id: "p1", name: "Validate", status: "draft", phase_order: 2, approval_gate_required: false, approval_gate_status: "not_requested", created_at: now },
  ],
  sprint_items: [
    { id: "t1", project_id: "p1", sprint_id: "s1", title: "Implement feature", status: "done", task_type: "build_implementation", assignee_agent_id: "a1", position: 1 },
    { id: "t2", project_id: "p1", sprint_id: "s2", title: "Validate feature", status: "todo", task_type: "qa_validation", assignee_agent_id: null, position: 2 },
  ],
  agent_events: [],
});

const stateBeforeRepo = await syncProjectState(db, "p1");
assert.equal(stateBeforeRepo.progressPct, 50);

// Mark downstream task done too, then sync into capped-not-complete state.
db.tables.sprint_items[1].status = "done";
const completeButBlocked = await syncProjectState(db, "p1");
assert.equal(completeButBlocked.progressPct, 95);
assert.equal(db.tables.projects[0].status, "active");

const blockedAdvance = await maybeAdvanceProjectAfterTaskDone(db, { projectId: "p1", completedTaskId: "t1" });
assert.equal(blockedAdvance.advanced, false);
assert.equal(blockedAdvance.reason, "required_artifacts_missing");

// Attach a real repo, but keep review gate unapproved.
db.tables.projects[0].links = { github: "https://github.com/vercel/next.js" };
const gatedAdvance = await maybeAdvanceProjectAfterTaskDone(db, { projectId: "p1", completedTaskId: "t1" });
assert.equal(gatedAdvance.advanced, false);
assert.equal(gatedAdvance.reason, "review_gate_not_approved");

// Approve the gate, then advancement is allowed.
db.tables.sprints[0].approval_gate_status = "approved";
db.tables.sprint_items[1].status = "todo";
const approvedAdvance = await maybeAdvanceProjectAfterTaskDone(db, { projectId: "p1", completedTaskId: "t1" });
assert.equal(approvedAdvance.advanced, true);
assert.equal(db.tables.sprints[0].status, "completed");
assert.equal(db.tables.sprints[1].status, "active");

console.log("verify-artifact-workflow-repro: ok");

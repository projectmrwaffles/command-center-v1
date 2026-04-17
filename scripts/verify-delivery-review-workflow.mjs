import { ensureMilestoneReviewSubmission } from "../src/lib/review-submission.ts";
import { finalizeCheckpointApproval } from "../src/lib/checkpoint-approval.ts";
import { reconcileProjectPhaseProgression } from "../src/lib/project-handoff.ts";
import { syncProjectState } from "../src/lib/project-state.ts";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMockDb(seed) {
  const tables = clone(seed);
  let idCounter = 1;

  function applyFilters(rows, filters) {
    return rows.filter((row) => filters.every((filter) => {
      if (filter.kind === "eq") return row[filter.column] === filter.value;
      if (filter.kind === "in") return filter.values.includes(row[filter.column]);
      return true;
    }));
  }

  function query(table) {
    const state = { filters: [], updatePayload: null, insertPayload: null, orderBy: null, limitCount: null };

    const materialize = () => {
      let rows = applyFilters(tables[table] || [], state.filters);
      if (state.orderBy) {
        const { column, ascending } = state.orderBy;
        rows = rows.slice().sort((a, b) => {
          if (a[column] === b[column]) return 0;
          return (a[column] < b[column] ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      if (typeof state.limitCount === "number") rows = rows.slice(0, state.limitCount);
      return rows;
    };

    const api = {
      select() { return api; },
      eq(column, value) {
        state.filters.push({ kind: "eq", column, value });
        return api;
      },
      in(column, values) { state.filters.push({ kind: "in", column, values }); return api; },
      order(column, { ascending = true } = {}) { state.orderBy = { column, ascending }; return api; },
      limit(count) { state.limitCount = count; return api; },
      update(payload) { state.updatePayload = payload; return api; },
      insert(payload) {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ id: row.id || `${table}-${idCounter++}`, ...clone(row) }));
        if (!tables[table]) tables[table] = [];
        tables[table].push(...rows);
        return {
          select() {
            return {
              single() {
                return Promise.resolve({ data: rows[0] ?? null, error: null });
              },
            };
          },
          then(resolve, reject) {
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          },
        };
      },
      single() { const rows = materialize(); return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      maybeSingle() { const rows = materialize(); return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(resolve, reject) {
        const rows = materialize();
        if (state.updatePayload) {
          for (const row of rows) Object.assign(row, state.updatePayload);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };

    return api;
  }

  return { from(table) { return query(table); }, tables };
}

const now = "2026-04-17T20:00:00.000Z";
const db = createMockDb({
  projects: [{ id: "p1", name: "Command Center", type: "web_app", status: "active", intake: {}, links: {}, github_repo_binding: { repo_url: "https://github.com/acme/cc" } }],
  sprints: [
    { id: "build-1", project_id: "p1", name: "Phase 2 · Build", phase_key: "build", status: "active", phase_order: 2, approval_gate_required: false, approval_gate_status: "not_requested", delivery_review_required: true, delivery_review_status: "not_requested", checkpoint_type: "delivery_review", checkpoint_evidence_requirements: null, created_at: now },
  ],
  sprint_items: [
    { id: "task-1", project_id: "p1", sprint_id: "build-1", title: "Ship build slice", status: "done", assignee_agent_id: null, position: 1, task_type: "build_implementation", review_required: true, review_status: "not_requested", updated_at: now },
  ],
  milestone_submissions: [],
  proof_bundles: [],
  proof_items: [],
  agent_events: [],
});

const submission = await ensureMilestoneReviewSubmission(db, {
  projectId: "p1",
  sprintId: "build-1",
  sprintName: "Phase 2 · Build",
  tasks: db.tables.sprint_items,
});
const pendingDeliveryReviewStatus = db.tables.sprints[0].delivery_review_status;
const statePending = await syncProjectState(db, "p1");

await db.from("milestone_submissions").update({ checkpoint_type: "delivery_review", status: "submitted" }).eq("id", submission.id).eq("sprint_id", "build-1");
await finalizeCheckpointApproval(db, { projectId: "p1", milestoneId: "build-1", decidedAt: now, reviewKind: "delivery_review" });
await reconcileProjectPhaseProgression(db, { projectId: "p1" });
const stateApproved = await syncProjectState(db, "p1");

const assertions = [
  {
    name: "build completion materializes a delivery review submission",
    ok: Boolean(submission?.id),
    detail: `submission=${submission?.id || "missing"}`,
  },
  {
    name: "build sprint enters delivery review pending state instead of reading done",
    ok: pendingDeliveryReviewStatus === "pending" && statePending.projectStatus === "active",
    detail: `delivery_review_status=${pendingDeliveryReviewStatus}; project_status=${statePending.projectStatus}`,
  },
  {
    name: "approving delivery review clears the review state",
    ok: db.tables.sprints[0].delivery_review_status === "approved",
    detail: `delivery_review_status=${db.tables.sprints[0].delivery_review_status}; sprint_status=${db.tables.sprints[0].status}; project_status=${stateApproved.projectStatus}`,
  },
];

let failed = false;
for (const assertion of assertions) {
  const prefix = assertion.ok ? "PASS" : "FAIL";
  console.log(`${prefix} - ${assertion.name}: ${assertion.detail}`);
  if (!assertion.ok) failed = true;
}

if (failed) process.exit(1);

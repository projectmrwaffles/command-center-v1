import { deriveMilestoneEvidenceRequirements, validateProofBundleRequirements } from "../src/lib/milestone-review.ts";
import { ensureMilestoneReviewSubmission } from "../src/lib/review-submission.ts";

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
    const state = { filters: [], updatePayload: null, orderBy: null, limitCount: null };
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
      eq(column, value) { state.filters.push({ kind: "eq", column, value }); return api; },
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
const uiRequirements = deriveMilestoneEvidenceRequirements({
  checkpointType: "delivery_review",
  phaseKey: "build",
  sprintName: "Phase 2 · Build",
  projectType: "web_app",
  projectIntake: { shape: "web-app", capabilities: ["frontend"] },
});
const apiRequirements = deriveMilestoneEvidenceRequirements({
  checkpointType: "delivery_review",
  phaseKey: "build",
  sprintName: "Phase 2 · Build",
  projectType: "product_build",
  projectIntake: { shape: "ops-system", capabilities: ["backend-data"] },
});

const noScreenshotValidation = validateProofBundleRequirements({
  checkpointType: "delivery_review",
  evidenceRequirements: uiRequirements,
  items: [{ kind: "commit" }],
});
const screenshotValidation = validateProofBundleRequirements({
  checkpointType: "delivery_review",
  evidenceRequirements: uiRequirements,
  items: [{ kind: "screenshot" }, { kind: "commit" }],
});

const db = createMockDb({
  projects: [{ id: "p1", name: "Command Center", type: "web_app", intake: { shape: "web-app", capabilities: ["frontend"] } }],
  sprints: [
    { id: "build-1", project_id: "p1", name: "Phase 2 · Build", phase_key: "build", approval_gate_required: false, delivery_review_required: true, delivery_review_status: "not_requested", checkpoint_type: "delivery_review", checkpoint_evidence_requirements: null, created_at: now },
  ],
  sprint_items: [
    { id: "task-1", project_id: "p1", sprint_id: "build-1", title: "Ship build slice", status: "done", task_type: "build_implementation", updated_at: now },
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
const autoSubmissionRequirements = db.tables.milestone_submissions[0]?.evidence_requirements;
const autoBundleStatus = db.tables.proof_bundles[0]?.completeness_status;

const assertions = [
  {
    name: "UI build delivery review requires screenshot proof",
    ok: uiRequirements.screenshotRequired === true && uiRequirements.minScreenshotCount === 1,
    detail: JSON.stringify(uiRequirements),
  },
  {
    name: "Backend-only build delivery review does not force screenshot proof",
    ok: apiRequirements.screenshotRequired === false && apiRequirements.minScreenshotCount === 0,
    detail: JSON.stringify(apiRequirements),
  },
  {
    name: "UI delivery review rejects proof bundles without screenshots",
    ok: noScreenshotValidation.ok === false && /screenshot/i.test(noScreenshotValidation.message || ""),
    detail: noScreenshotValidation.message,
  },
  {
    name: "UI delivery review accepts proof bundles with screenshots",
    ok: screenshotValidation.ok === true,
    detail: JSON.stringify(screenshotValidation),
  },
  {
    name: "Auto-created UI review packets stay incomplete until screenshot proof exists",
    ok: Boolean(submission?.id) && autoSubmissionRequirements?.screenshotRequired === true && autoBundleStatus === "incomplete",
    detail: `submission=${submission?.id || "missing"}; screenshotRequired=${String(autoSubmissionRequirements?.screenshotRequired)}; completeness=${autoBundleStatus}`,
  },
];

let failed = false;
for (const assertion of assertions) {
  const prefix = assertion.ok ? "PASS" : "FAIL";
  console.log(`${prefix} - ${assertion.name}: ${assertion.detail}`);
  if (!assertion.ok) failed = true;
}

if (failed) process.exit(1);

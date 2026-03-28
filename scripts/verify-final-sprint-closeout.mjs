import { maybeAdvanceProjectAfterTaskDone, reconcileProjectPhaseProgression } from "../src/lib/project-handoff.ts";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMockDb(seed) {
  const tables = clone(seed);
  const events = [];

  function applyFilters(rows, filters) {
    return rows.filter((row) => filters.every(({ column, value }) => row[column] === value));
  }

  function query(table) {
    const state = { filters: [], updatePayload: null, insertPayload: null };

    const api = {
      select() {
        return api;
      },
      eq(column, value) {
        state.filters.push({ column, value });
        if (state.updatePayload) {
          const rows = applyFilters(tables[table] || [], state.filters);
          for (const row of rows) Object.assign(row, state.updatePayload);
          return Promise.resolve({ data: rows, error: null });
        }
        return api;
      },
      update(payload) {
        state.updatePayload = payload;
        return api;
      },
      insert(payload) {
        const rows = Array.isArray(payload) ? payload : [payload];
        if (!tables[table]) tables[table] = [];
        tables[table].push(...clone(rows));
        if (table === "agent_events") events.push(...clone(rows));
        return Promise.resolve({ data: rows, error: null });
      },
      single() {
        const rows = applyFilters(tables[table] || [], state.filters);
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      maybeSingle() {
        const rows = applyFilters(tables[table] || [], state.filters);
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(resolve, reject) {
        const rows = applyFilters(tables[table] || [], state.filters);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };

    return api;
  }

  return {
    from(table) {
      return query(table);
    },
    tables,
    events,
  };
}

const baseSeed = {
  projects: [
    {
      id: "project-1",
      name: "Task App V6",
      type: "product",
      status: "active",
      intake: {},
      links: {},
      github_repo_binding: null,
    },
  ],
  sprints: [
    {
      id: "sprint-validate",
      project_id: "project-1",
      name: "Validate",
      status: "active",
      phase_order: 3,
      approval_gate_required: false,
      approval_gate_status: null,
      created_at: "2026-03-28T00:00:00.000Z",
    },
  ],
  sprint_items: [
    {
      id: "task-final",
      project_id: "project-1",
      sprint_id: "sprint-validate",
      title: "QA closeout",
      status: "done",
      assignee_agent_id: null,
      position: 1,
      task_type: "execution",
    },
  ],
  agent_events: [],
};

const assertions = [];

{
  const db = createMockDb(baseSeed);
  const result = await maybeAdvanceProjectAfterTaskDone(db, { projectId: "project-1", completedTaskId: "task-final" });
  assertions.push({
    name: "task completion path closes terminal sprint instead of returning no_next_sprint",
    ok: result.reason === "final_sprint_completed" && db.tables.sprints[0].status === "completed",
    detail: `reason=${result.reason}; sprint_status=${db.tables.sprints[0].status}`,
  });
}

{
  const db = createMockDb(baseSeed);
  const result = await reconcileProjectPhaseProgression(db, { projectId: "project-1" });
  assertions.push({
    name: "state reconciliation also completes the last sprint without a completedTaskId",
    ok: result.reason === "no_phase_change_needed" && db.tables.sprints[0].status === "completed",
    detail: `reason=${result.reason}; sprint_status=${db.tables.sprints[0].status}`,
  });
}

let failed = false;
for (const assertion of assertions) {
  const prefix = assertion.ok ? "PASS" : "FAIL";
  console.log(`${prefix} - ${assertion.name}: ${assertion.detail}`);
  if (!assertion.ok) failed = true;
}

if (failed) process.exit(1);

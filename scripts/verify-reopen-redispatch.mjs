import assert from 'node:assert/strict';
import { reopenProjectSprintForRevision, redispatchReopenedSprintTasks } from '../src/lib/revision-reopen.ts';

function createMockDb(seed) {
  const tables = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));

  let idCounter = 1;
  const nextId = (prefix) => `${prefix}-${idCounter++}`;

  function matches(row, filters) {
    return filters.every((filter) => {
      if (filter.kind === 'eq') return row[filter.column] === filter.value;
      if (filter.kind === 'in') return filter.values.includes(row[filter.column]);
      if (filter.kind === 'not_like') return !String(row[filter.column] ?? '').includes(filter.value.replaceAll('%', ''));
      return true;
    });
  }

  function buildSelectResult(rows, filters, orderBy, limitValue, maybeSingle, single) {
    let result = rows.filter((row) => matches(row, filters));
    for (const order of orderBy) {
      result = result.slice().sort((a, b) => {
        const av = a[order.column] ?? null;
        const bv = b[order.column] ?? null;
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return order.ascending ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
      });
    }
    if (typeof limitValue === 'number') result = result.slice(0, limitValue);
    if (single) return { data: result[0] ?? null, error: result[0] ? null : { message: 'Row not found' } };
    if (maybeSingle) return { data: result[0] ?? null, error: null };
    return { data: result, error: null };
  }

  function makeQuery(tableName, mode, values) {
    const rows = tables[tableName] || (tables[tableName] = []);
    const state = { filters: [], orderBy: [], limitValue: undefined, maybeSingle: false, single: false };
    const api = {
      eq(column, value) { state.filters.push({ kind: 'eq', column, value }); return api; },
      in(column, values) { state.filters.push({ kind: 'in', column, values }); return api; },
      not(column, op, value) { if (op === 'like') state.filters.push({ kind: 'not_like', column, value }); return api; },
      order(column, { ascending = true } = {}) { state.orderBy.push({ column, ascending }); return api; },
      limit(value) { state.limitValue = value; return api; },
      select() { return api; },
      maybeSingle() { state.maybeSingle = true; return Promise.resolve(run()); },
      single() { state.single = true; return Promise.resolve(run()); },
      then(resolve) { return Promise.resolve(run()).then(resolve); },
    };

    function run() {
      if (mode === 'select') return buildSelectResult(rows, state.filters, state.orderBy, state.limitValue, state.maybeSingle, state.single);
      if (mode === 'update') {
        const updated = [];
        for (const row of rows) {
          if (matches(row, state.filters)) {
            Object.assign(row, values);
            updated.push({ ...row });
          }
        }
        if (state.single) return { data: updated[0] ?? null, error: updated[0] ? null : { message: 'Row not found' } };
        return { data: updated, error: null };
      }
      if (mode === 'insert') {
        const inserted = (Array.isArray(values) ? values : [values]).map((value) => ({ id: value.id ?? nextId(tableName), ...value }));
        rows.push(...inserted);
        if (state.single) return { data: inserted[0], error: null };
        return { data: inserted, error: null };
      }
      throw new Error(`Unsupported mode ${mode}`);
    }

    return api;
  }

  return {
    tables,
    from(tableName) {
      return {
        select() { return makeQuery(tableName, 'select'); },
        update(values) { return makeQuery(tableName, 'update', values); },
        insert(values) { return makeQuery(tableName, 'insert', values); },
      };
    },
    channel() {
      return { async send() { return { error: null }; } };
    },
  };
}

const now = '2026-04-23T21:00:00.000Z';
const db = createMockDb({
  projects: [
    { id: 'project-1', name: 'Content Planner 9.0', status: 'completed', updated_at: null, type: 'web' },
  ],
  sprints: [
    { id: 's1', project_id: 'project-1', name: 'Discovery', status: 'completed', phase_order: 1, created_at: '2026-04-20T00:00:00.000Z', phase_key: 'discover', approval_gate_required: false, approval_gate_status: 'not_requested', delivery_review_required: false, delivery_review_status: 'not_requested' },
    { id: 's2', project_id: 'project-1', name: 'Build', status: 'completed', phase_order: 2, created_at: '2026-04-20T00:01:00.000Z', phase_key: 'build', approval_gate_required: false, approval_gate_status: 'not_requested', delivery_review_required: true, delivery_review_status: 'rejected' },
    { id: 's3', project_id: 'project-1', name: 'Validate', status: 'draft', phase_order: 3, created_at: '2026-04-20T00:02:00.000Z', phase_key: 'validate', approval_gate_required: false, approval_gate_status: 'not_requested', delivery_review_required: false, delivery_review_status: 'not_requested' },
  ],
  sprint_items: [
    { id: 'task-build', project_id: 'project-1', sprint_id: 's2', title: 'Implement approved revisions', status: 'todo', assignee_agent_id: 'agent-1', owner_team_id: null, task_type: null, review_required: true, review_status: 'revision_requested' },
  ],
  jobs: [],
  agents: [
    { id: 'agent-1', status: 'idle', current_job_id: null, name: 'Backend Engineer' },
  ],
  agent_events: [],
  agent_notifications: [],
});

await reopenProjectSprintForRevision(db, { projectId: 'project-1', sprintId: 's2', now });
const dispatchResults = await redispatchReopenedSprintTasks(db, { projectId: 'project-1', sprintId: 's2' });

assert.equal(db.tables.projects[0].status, 'active');
assert.equal(db.tables.sprints.find((row) => row.id === 's2')?.status, 'active');
assert.equal(db.tables.sprints.find((row) => row.id === 's3')?.status, 'draft');
assert.equal(dispatchResults.length, 1);
assert.equal(dispatchResults[0].dispatched, true);
assert.equal(db.tables.jobs.length, 1);
assert.equal(db.tables.jobs[0].summary, 'task:task-build');
assert.equal(db.tables.jobs[0].status, 'queued');
assert.equal(db.tables.agent_events.some((event) => event.event_type === 'task_dispatched'), true);

console.log('verify-reopen-redispatch: ok', JSON.stringify({
  reopenedSprint: db.tables.sprints.find((row) => row.id === 's2')?.status,
  downstreamSprint: db.tables.sprints.find((row) => row.id === 's3')?.status,
  dispatchResults,
  queuedJob: db.tables.jobs[0],
}));

import assert from 'node:assert/strict';
import { getTaskExecutionBlocker } from '../src/lib/project-execution.ts';
import { reconcileProjectPhaseProgression } from '../src/lib/project-handoff.ts';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDb(tables) {
  return {
    tables,
    from(table) {
      return createQuery(this.tables, table);
    },
    channel() {
      return { async send() { return { error: null }; } };
    },
  };
}

function createQuery(tables, table) {
  const state = { filters: [], orderBy: null, limitCount: null, pendingUpdate: null, pendingInsert: null, pendingDelete: false };
  const api = {
    select() { return api; },
    eq(column, value) { state.filters.push((row) => row?.[column] === value); return api; },
    in(column, values) { state.filters.push((row) => values.includes(row?.[column])); return api; },
    not(column, op, value) {
      if (op === 'like') state.filters.push((row) => typeof row?.[column] === 'string' && !row[column].startsWith(String(value).replace(/%$/, '')));
      return api;
    },
    order(column, { ascending = true } = {}) { state.orderBy = { column, ascending }; return api; },
    limit(count) { state.limitCount = count; return api; },
    update(payload) { state.pendingUpdate = payload; return api; },
    insert(payload) { state.pendingInsert = payload; return api; },
    delete() { state.pendingDelete = true; return api; },
    async maybeSingle() { const rows = apply(); return { data: rows[0] ?? null, error: null }; },
    async single() { const rows = apply(); return { data: rows[0] ?? null, error: rows[0] ? null : { message: `No row in ${table}` } }; },
    then(resolve, reject) { return Promise.resolve({ data: apply(), error: null }).then(resolve, reject); },
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
    if (typeof state.limitCount === 'number') next = next.slice(0, state.limitCount);
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
      tables[table].push(...inserted.map((row, index) => ({ id: row.id ?? `${table}-${tables[table].length + index + 1}`, ...row })));
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
    id: 'project-1',
    name: 'Phase sequencing QA unlock',
    status: 'active',
    type: 'product_build',
    intake: { shape: 'web-app', capabilities: ['frontend'], githubRepoProvisioning: { status: 'ready' } },
    links: { github: 'https://github.com/vercel/next.js' },
    github_repo_binding: { url: 'https://github.com/vercel/next.js' },
    progress_pct: 0,
    updated_at: now,
  }],
  sprints: [
    { id: 'discover', project_id: 'project-1', name: 'Phase 1 · Discover', status: 'completed', phase_key: 'discover', phase_order: 1, approval_gate_required: false, approval_gate_status: 'not_requested', created_at: now },
    { id: 'build', project_id: 'project-1', name: 'Phase 2 · Build', status: 'active', phase_key: 'build', phase_order: 2, approval_gate_required: false, approval_gate_status: 'approved', delivery_review_required: true, delivery_review_status: 'pending', created_at: now },
    { id: 'validate', project_id: 'project-1', name: 'Phase 3 · Validate', status: 'draft', phase_key: 'validate', phase_order: 3, approval_gate_required: false, approval_gate_status: 'not_requested', delivery_review_required: false, delivery_review_status: null, created_at: now },
  ],
  sprint_items: [
    { id: 'build-task', project_id: 'project-1', sprint_id: 'build', title: 'Frontend implementation', status: 'done', task_type: 'build_implementation', review_required: true, review_status: 'not_requested', assignee_agent_id: 'agent-build', position: 1 },
    { id: 'qa-task', project_id: 'project-1', sprint_id: 'validate', title: 'Acceptance review', status: 'todo', task_type: 'qa_validation', review_required: true, review_status: 'not_requested', assignee_agent_id: 'agent-qa', position: 2 },
  ],
  jobs: [],
  agents: [
    { id: 'agent-build', status: 'idle', current_job_id: null },
    { id: 'agent-qa', status: 'idle', current_job_id: null },
  ],
  agent_events: [],
  agent_notifications: [],
  milestone_submissions: [],
  proof_bundles: [],
  proof_items: [],
});

const blocker = getTaskExecutionBlocker({
  project: db.tables.projects[0],
  task: db.tables.sprint_items.find((task) => task.id === 'qa-task'),
  sprint: db.tables.sprints.find((sprint) => sprint.id === 'validate'),
  sprints: db.tables.sprints,
  tasks: db.tables.sprint_items,
  jobs: db.tables.jobs,
  agents: db.tables.agents,
});
assert.equal(blocker, null, 'validate-phase QA should be runnable once build implementation is complete');

const result = await reconcileProjectPhaseProgression(db, { projectId: 'project-1' });
assert.equal(result.advanced, true, `expected progression advance, got ${JSON.stringify(result)}`);
assert.equal(db.tables.sprints.find((row) => row.id === 'build')?.status, 'completed');
assert.equal(db.tables.sprints.find((row) => row.id === 'validate')?.status, 'active');
assert.deepEqual(result.dispatchedTaskIds, ['qa-task']);

console.log('verify-validate-phase-sequencing-unblocks-qa: ok', JSON.stringify({
  blocker,
  result,
  buildStatus: db.tables.sprints.find((row) => row.id === 'build')?.status,
  validateStatus: db.tables.sprints.find((row) => row.id === 'validate')?.status,
  qaJob: db.tables.jobs.find((row) => row.summary === 'task:qa-task') || null,
}, null, 2));

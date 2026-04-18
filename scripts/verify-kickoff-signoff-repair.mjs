import assert from 'node:assert/strict';
import { repairKickoffSignoffTasks } from '../src/lib/kickoff-signoff-repair.ts';

const updates = [];
const fakeTasks = [
  {
    id: 'design-1',
    task_type: 'design',
    review_required: false,
    review_status: 'not_requested',
    task_metadata: { phase_key: 'design', auto_generated: true },
  },
  {
    id: 'build-1',
    task_type: 'build_implementation',
    review_required: false,
    review_status: 'not_requested',
    task_metadata: { phase_key: 'build', auto_generated: true },
  },
  {
    id: 'discover-1',
    task_type: 'discovery_plan',
    review_required: false,
    review_status: 'not_requested',
    task_metadata: { phase_key: 'discover', auto_generated: true },
  },
  {
    id: 'manual-1',
    task_type: 'design',
    review_required: false,
    review_status: 'not_requested',
    task_metadata: { phase_key: 'design', auto_generated: false },
  },
];

const fakeDb = {
  from(table) {
    if (table === 'sprint_items') {
      return {
        select() { return this; },
        eq() { return Promise.resolve({ data: fakeTasks, error: null }); },
        update(payload) {
          return {
            in(column, ids) {
              updates.push({ payload, column, ids });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    }
    throw new Error(`Unexpected table ${table}`);
  },
};

const result = await repairKickoffSignoffTasks(fakeDb, { projectId: 'project-1' });
assert.equal(result.repaired, 2);
assert.equal(updates.length, 1);
assert.deepEqual(updates[0].ids.sort(), ['build-1', 'design-1']);
assert.equal(updates[0].payload.review_required, true);
assert.equal(updates[0].payload.review_status, 'awaiting_review');
console.log('verify-kickoff-signoff-repair: ok');

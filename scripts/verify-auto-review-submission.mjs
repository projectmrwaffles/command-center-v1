import assert from 'node:assert/strict';
import { ensureMilestoneReviewSubmission } from '../src/lib/review-submission.ts';

const calls = [];
const state = {
  insertedSubmission: null,
  insertedBundle: null,
  insertedProofItems: null,
  sprintUpdate: null,
  eventInsert: null,
};

const fakeDb = {
  from(table) {
    return {
      select() { return this; },
      eq() { return this; },
      in() { return this; },
      order() { return this; },
      limit() { return this; },
      maybeSingle() {
        if (table === 'milestone_submissions') return Promise.resolve({ data: null, error: null });
        if (table === 'sprints') return Promise.resolve({ data: { id: 's1', name: 'Build', phase_key: 'build', approval_gate_required: false, delivery_review_required: true, delivery_review_status: 'not_requested', checkpoint_type: 'delivery_review', checkpoint_evidence_requirements: {} }, error: null });
        if (table === 'projects') return Promise.resolve({ data: { id: 'p1', type: 'product_build', intake: { shape: 'automation', capabilities: ['backend'] }, links: { preview: 'https://example.com/preview' } }, error: null });
        throw new Error(`unexpected maybeSingle table ${table}`);
      },
      single() {
        if (table === 'milestone_submissions') return Promise.resolve({ data: { id: 'sub1', revision_number: 1 }, error: null });
        if (table === 'proof_bundles') return Promise.resolve({ data: { id: 'bundle1' }, error: null });
        throw new Error(`unexpected single table ${table}`);
      },
      insert(payload) {
        calls.push({ table, payload });
        if (table === 'milestone_submissions') state.insertedSubmission = payload;
        if (table === 'proof_bundles') state.insertedBundle = payload;
        if (table === 'proof_items') state.insertedProofItems = payload;
        if (table === 'agent_events') state.eventInsert = payload;
        return this;
      },
      update(payload) {
        state.sprintUpdate = payload;
        return this;
      },
    };
  },
};

await ensureMilestoneReviewSubmission(fakeDb, {
  projectId: 'p1',
  sprintId: 's1',
  sprintName: 'Build',
  tasks: [
    { id: 't1', title: 'Frontend Feature', status: 'done', task_type: 'build_implementation', updated_at: '2026-04-18T20:00:00.000Z' },
  ],
  completionEvents: [
    { payload: { task_id: 't1', message: 'Preview `https://example.com/preview` commit `abc1234` file `/tmp/demo.png`' } },
  ],
});

assert.equal(state.insertedSubmission.checkpoint_type, 'delivery_review');
assert.equal(state.insertedBundle.completeness_status, 'ready');
assert.equal(state.insertedProofItems.length, 3);
assert.deepEqual(state.insertedProofItems.map((item) => item.kind).sort(), ['artifact', 'commit', 'staging_url']);
assert.equal(state.sprintUpdate.delivery_review_status, 'pending');
assert.equal(state.eventInsert.event_type, 'milestone_submission_created');
console.log('verify-auto-review-submission: ok');

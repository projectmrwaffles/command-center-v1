import assert from 'node:assert/strict';
import { ensureMilestoneReviewSubmission } from '../src/lib/review-submission.ts';

function createFakeDb(config) {
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
        if (table === 'sprints') return Promise.resolve({ data: config.sprint, error: null });
        if (table === 'projects') return Promise.resolve({ data: config.project, error: null });
        throw new Error(`unexpected maybeSingle table ${table}`);
      },
      single() {
        if (table === 'milestone_submissions') return Promise.resolve({ data: config.submission, error: null });
        if (table === 'proof_bundles') return Promise.resolve({ data: config.bundle, error: null });
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

  return { fakeDb, calls, state };
}

{
const { fakeDb, state } = createFakeDb({
  sprint: { id: 's1', name: 'Build', phase_key: 'build', approval_gate_required: false, delivery_review_required: true, delivery_review_status: 'not_requested', checkpoint_type: 'delivery_review', checkpoint_evidence_requirements: {} },
  project: { id: 'p1', type: 'product_build', intake: { shape: 'automation', capabilities: ['backend'] }, links: { preview: 'https://example.com/preview' } },
  submission: { id: 'sub1', revision_number: 1 },
  bundle: { id: 'bundle1' },
});

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
}

{
const { fakeDb, state } = createFakeDb({
  sprint: { id: 's2', name: 'Phase 4 · Validate', phase_key: 'validate', approval_gate_required: false, delivery_review_required: false, delivery_review_status: 'not_requested', checkpoint_type: 'acceptance_review', checkpoint_evidence_requirements: {} },
  project: { id: 'p2', type: 'web_app', intake: { shape: 'web-app', capabilities: ['frontend'] }, links: { preview: 'https://example.com/qa' } },
  submission: { id: 'sub2', revision_number: 1 },
  bundle: { id: 'bundle2' },
});

await ensureMilestoneReviewSubmission(fakeDb, {
  projectId: 'p2',
  sprintId: 's2',
  sprintName: 'Phase 4 · Validate',
  tasks: [
    { id: 't2', title: 'QA validation for kickoff deliverables', status: 'done', task_type: 'qa_validation', review_required: true, updated_at: '2026-04-19T19:00:00.000Z' },
  ],
  completionEvents: [
    { payload: { task_id: 't2', message: 'Preview `https://example.com/qa` screenshot `/tmp/qa-proof.png`' } },
  ],
});

assert.equal(state.insertedSubmission.checkpoint_type, 'acceptance_review');
assert.equal(state.insertedBundle.completeness_status, 'ready');
assert.deepEqual(state.insertedProofItems.map((item) => item.kind).sort(), ['artifact', 'staging_url']);
assert.equal(state.sprintUpdate.approval_gate_status, 'pending');
assert.equal(state.eventInsert.event_type, 'milestone_submission_created');
}

console.log('verify-auto-review-submission: ok');

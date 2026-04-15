import assert from 'node:assert/strict';

const { recoverAttachmentUploadFailure } = await import('../src/lib/project-requirements-repair.ts');

const derivedRequirements = {
  derivedAt: new Date().toISOString(),
  summary: ['Derived from uploaded PRD'],
  constraints: [],
  requiredFrameworks: [],
  sourceCount: 1,
  sources: [{ title: 'spec.pdf', type: 'prd_pdf', evidence: ['saved attachment evidence'] }],
  technologyRequirements: [],
};

const updates = [];
const fakeDb = {
  from(table) {
    if (table === 'projects') {
      return {
        update(payload) {
          return {
            eq(column, value) {
              updates.push({ table, payload, column, value });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    }

    if (table === 'project_documents') {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    order() {
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    }

    throw new Error(`Unexpected table ${table}`);
  },
  storage: {
    from() {
      return {
        download: async () => ({ data: null, error: null }),
      };
    },
  },
};

const result = await recoverAttachmentUploadFailure(fakeDb, {
  projectId: 'proj-123',
  fileCount: 1,
  errorDetail: 'Synthetic post-derivation failure',
  intake: {
    requirements: derivedRequirements,
    attachmentKickoffState: {
      status: 'deriving_requirements',
      label: 'Deriving requirements',
      detail: 'pre-fix repro state',
      progressPct: 62,
      active: true,
      updatedAt: new Date().toISOString(),
    },
  },
});

assert.equal(result.recovered, true, 'recoverable attachment-backed failure should be downgraded from terminal failure');
assert.equal(updates.length, 1, 'should persist one recovered project update');
assert.equal(updates[0].payload.intake.attachmentKickoffState.status, 'requirements_ready');
assert.equal(updates[0].payload.intake.attachmentKickoffState.label, 'Requirements ready');
assert.equal(updates[0].payload.intake.attachmentKickoffState.active, true);
assert.equal(updates[0].payload.intake.attachmentKickoffState.fileCount, 1);
assert.equal(updates[0].payload.intake.attachmentKickoffState.detail, 'Synthetic post-derivation failure');
assert.ok(!('error' in updates[0].payload.intake.attachmentKickoffState), 'recovered state must not remain terminal failed');

console.log('PASS recoverable attachment upload failure no longer persists terminal failed state');

import assert from 'node:assert/strict';

const { processAttachmentBackedProject } = await import('../src/lib/project-requirements-repair.ts');

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
                in() {
                  return {
                    order() {
                      return Promise.resolve({
                        data: [{ title: 'spec.pdf', type: 'prd_pdf', mime_type: 'application/pdf', storage_path: 'proj/spec.pdf', created_at: new Date().toISOString() }],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      };
    }

    if (table === 'sprints') {
      return {
        select(_fields, opts) {
          return {
            eq() {
              if (opts?.head) return Promise.resolve({ count: 1, error: null });
              return Promise.resolve({ data: [{ id: 's1', name: 'Kickoff' }], error: null });
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
        download: async () => ({
          data: {
            arrayBuffer: async () => new TextEncoder().encode('fake pdf bytes').buffer,
          },
          error: null,
        }),
      };
    },
  },
};

const repaired = await processAttachmentBackedProject(fakeDb, {
  project: {
    id: 'proj-123',
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
  },
  forceProcessing: true,
  fileCount: 1,
  failureDetail: 'Synthetic post-derivation failure',
});

assert.equal(repaired.attachmentRequirementsReady, true);
assert.equal(repaired.finalized, false);
assert.equal(updates.at(-1).payload.intake.attachmentKickoffState.status, 'requirements_ready');
assert.equal(updates.at(-1).payload.intake.attachmentKickoffState.detail, 'Synthetic post-derivation failure');
assert.ok(!('error' in updates.at(-1).payload.intake.attachmentKickoffState));

const failureUpdates = [];
const failingDb = {
  from(table) {
    if (table === 'projects') {
      return {
        update(payload) {
          return {
            eq(column, value) {
              failureUpdates.push({ table, payload, column, value });
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
                in() {
                  return {
                    order() {
                      return Promise.resolve({
                        data: [{ title: 'spec.pdf', type: 'prd_pdf', mime_type: 'application/pdf', storage_path: 'proj/spec.pdf', created_at: new Date().toISOString() }],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      };
    }

    if (table === 'sprints') {
      return {
        select(_fields, opts) {
          return {
            eq() {
              if (opts?.head) return Promise.resolve({ count: 0, error: null });
              return Promise.resolve({ data: [], error: null });
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
        download: async () => ({ data: null, error: { message: 'missing blob' } }),
      };
    },
  },
};

const paused = await processAttachmentBackedProject(failingDb, {
  project: { id: 'proj-456', intake: { attachmentKickoffState: { status: 'upload_received', active: true, updatedAt: new Date().toISOString() } } },
  forceProcessing: true,
  fileCount: 1,
});

assert.equal(paused.attachmentRequirementsReady, false);
assert.equal(paused.recoverable, true);
assert.equal(failureUpdates.at(-1).payload.intake.attachmentKickoffState.status, 'retryable_failure');
assert.equal(failureUpdates.at(-1).payload.intake.attachmentKickoffState.recoverable, true);
assert.equal(failureUpdates.at(-1).payload.intake.attachmentKickoffState.retryable, true);

console.log('PASS attachment processing is now durable, retryable, and decoupled from upload success');

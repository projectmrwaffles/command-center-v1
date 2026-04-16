import assert from 'node:assert/strict';

const [{ enqueueAttachmentProcessingJob, persistAttachmentQueuedState, ATTACHMENT_PROCESSING_AGENT_ID }, { processAttachmentBackedProject }] = await Promise.all([
  import('../src/lib/attachment-processing-jobs.ts'),
  import('../src/lib/project-requirements-repair.ts'),
]);

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
const inserts = [];

const queueDb = {
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

    if (table === 'jobs') {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({ data: null, error: null });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        insert(payload) {
          inserts.push(payload);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: { id: 'job-1' }, error: null });
                },
              };
            },
          };
        },
      };
    }

    throw new Error(`Unexpected table ${table}`);
  },
};

const queuedIntake = await persistAttachmentQueuedState(queueDb, {
  projectId: 'proj-queue',
  intake: {},
  fileCount: 2,
});
const job = await enqueueAttachmentProcessingJob(queueDb, {
  projectId: 'proj-queue',
  projectName: 'Queue Test',
});

assert.equal(queuedIntake.attachmentKickoffState.status, 'upload_received');
assert.match(queuedIntake.attachmentKickoffState.detail, /durable attachment worker/i);
assert.equal(job.jobId, 'job-1');
assert.equal(inserts[0].owner_agent_id, ATTACHMENT_PROCESSING_AGENT_ID);
assert.equal(inserts[0].status, 'queued');
assert.equal(inserts[0].summary, 'attachment_processing:proj-queue');

const workerUpdates = [];
const workerDb = {
  from(table) {
    if (table === 'projects') {
      return {
        update(payload) {
          return {
            eq(column, value) {
              workerUpdates.push({ table, payload, column, value });
              return Promise.resolve({ error: null });
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
              return Promise.resolve({ data: [{ id: 'kickoff-1', name: 'Kickoff' }], error: null });
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
        download: async () => ({ data: null, error: { message: 'unused in this verification path' } }),
      };
    },
  },
};

const processed = await processAttachmentBackedProject(workerDb, {
  project: {
    id: 'proj-queue',
    intake: {
      ...queuedIntake,
      requirements: derivedRequirements,
    },
  },
  forceProcessing: true,
  fileCount: 2,
});

assert.equal(processed.attachmentRequirementsReady, true);
assert.equal(processed.finalized, false);
assert.equal(workerUpdates.at(-1).payload.intake.attachmentKickoffState.status, 'requirements_ready');

console.log('PASS attachment uploads queue durable jobs and worker processing advances requirements outside request path');

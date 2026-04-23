import assert from 'node:assert/strict';
import { reopenProjectSprintForRevision } from '../src/lib/revision-reopen.ts';

function createMockDb(seed) {
  const tables = {
    projects: seed.projects.map((row) => ({ ...row })),
    sprints: seed.sprints.map((row) => ({ ...row })),
  };

  function matches(row, filters) {
    return filters.every((filter) => {
      if (filter.kind === 'eq') return row[filter.column] === filter.value;
      if (filter.kind === 'in') return filter.values.includes(row[filter.column]);
      return true;
    });
  }

  return {
    tables,
    from(tableName) {
      const table = tables[tableName];
      if (!table) throw new Error(`Unknown table ${tableName}`);
      return {
        select() {
          const filters = [];
          return {
            eq(column, value) {
              filters.push({ kind: 'eq', column, value });
              return this;
            },
            async then(resolve) {
              return resolve({ data: table.filter((row) => matches(row, filters)), error: null });
            },
          };
        },
        update(values) {
          const filters = [];
          const chain = {
            eq(column, value) {
              filters.push({ kind: 'eq', column, value });
              return chain;
            },
            in(column, valuesList) {
              filters.push({ kind: 'in', column, values: valuesList });
              return chain;
            },
            async then(resolve) {
              for (const row of table) {
                if (matches(row, filters)) Object.assign(row, values);
              }
              return resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  };
}

const now = '2026-04-23T21:00:00.000Z';
const db = createMockDb({
  projects: [
    { id: 'project-1', status: 'completed', updated_at: null },
  ],
  sprints: [
    { id: 's1', project_id: 'project-1', status: 'completed', phase_order: 1, created_at: '2026-04-20T00:00:00.000Z' },
    { id: 's2', project_id: 'project-1', status: 'completed', phase_order: 2, created_at: '2026-04-20T00:01:00.000Z' },
    { id: 's3', project_id: 'project-1', status: 'completed', phase_order: 3, created_at: '2026-04-20T00:02:00.000Z' },
  ],
});

await reopenProjectSprintForRevision(db, { projectId: 'project-1', sprintId: 's2', now });

assert.equal(db.tables.projects[0].status, 'active');
assert.equal(db.tables.projects[0].updated_at, now);
assert.equal(db.tables.sprints.find((row) => row.id === 's2')?.status, 'active');
assert.equal(db.tables.sprints.find((row) => row.id === 's2')?.updated_at, now);
assert.equal(db.tables.sprints.find((row) => row.id === 's3')?.status, 'draft');
assert.equal(db.tables.sprints.find((row) => row.id === 's1')?.status, 'completed');

console.log('verify-revision-reopen: ok', JSON.stringify({
  projectStatus: db.tables.projects[0].status,
  reopenedSprint: db.tables.sprints.find((row) => row.id === 's2')?.status,
  resetSprint: db.tables.sprints.find((row) => row.id === 's3')?.status,
}));

import assert from 'node:assert/strict';
import { buildProjectKickoffPlan } from '../src/lib/project-kickoff.ts';

const plan = buildProjectKickoffPlan({
  projectName: 'Demo Product',
  type: 'web_app',
  intake: {
    shape: 'web-app',
    capabilities: ['ux-ui', 'frontend'],
    requirements: {
      summary: ['Next.js app', 'UI flow'],
      derivedAt: '2026-04-18T00:00:00.000Z',
      constraints: [],
      requiredFrameworks: ['nextjs'],
      sourceCount: 1,
      sources: [{ title: 'PRD', type: 'pdf', evidence: ['demo'] }],
      technologyRequirements: [],
    },
  },
});

const design = plan.find((phase) => phase.key === 'design');
const build = plan.find((phase) => phase.key === 'build');
const validate = plan.find((phase) => phase.key === 'validate');

assert.ok(design, 'expected design phase');
assert.ok(build, 'expected build phase');
assert.ok(validate, 'expected validate phase');
assert.equal(design.tasks[0]?.reviewRequired, true, 'design milestone task should require review');
assert.equal(build.tasks[0]?.reviewRequired, true, 'build milestone task should require review');
assert.equal(validate.tasks[0]?.reviewRequired, true, 'validate milestone task should require review');

const discover = plan.find((phase) => phase.key === 'discover');
if (discover?.tasks?.[0]) {
  assert.equal(discover.tasks[0].reviewRequired, false, 'discovery task should remain non-review kickoff work');
}

console.log('verify-kickoff-signoff-milestones: ok');

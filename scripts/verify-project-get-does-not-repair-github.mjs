import assert from 'node:assert/strict';
import { syncProjectPreBuildCheckpoint } from '../src/lib/pre-build-checkpoint.ts';

let repairCalls = 0;

function makeChain(result = { data: [], error: null }) {
  return {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    in() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    maybeSingle: async () => ({ data: null, error: { code: 'PGRST116' } }),
    single: async () => ({ data: null, error: null }),
    update() {
      return this;
    },
    insert: async () => ({ data: null, error: null }),
    delete() {
      return this;
    },
    then(resolve) {
      return Promise.resolve(result).then(resolve);
    },
  };
}

const fakeDb = {
  from(table) {
    if (table === 'sprints') return makeChain({ data: [], error: null });
    if (table === 'milestone_submissions') return makeChain({ data: [], error: null });
    if (table === 'proof_bundles') return makeChain({ data: [], error: null });
    if (table === 'proof_items') return makeChain({ data: [], error: null });
    if (table === 'submission_feedback_items') return makeChain({ data: [], error: null });
    if (table === 'approvals') return makeChain({ data: [], error: null });
    if (table === 'agent_events') return makeChain({ data: [], error: null });
    return makeChain({ data: null, error: null });
  },
};

const project = {
  id: 'project-1',
  name: 'Demo App',
  intake: {
    requirements: {
      derivedAt: '2026-04-18T00:00:00.000Z',
      summary: ['Need Next.js'],
      constraints: [],
      sourceCount: 1,
      sources: [{ title: 'PRD', type: 'pdf', evidence: ['Next.js required'] }],
      requiredFrameworks: ['nextjs'],
      technologyRequirements: [
        {
          kind: 'framework',
          directive: 'required',
          rationale: 'PRD requires Next.js',
          sourceTitles: ['PRD'],
          choices: [{ slug: 'nextjs', label: 'Next.js', aliases: ['next'], kind: 'framework' }],
        },
      ],
    },
  },
  github_repo_binding: {
    provider: 'github',
    source: 'provisioned',
    owner: 'acme',
    repo: 'demo-app',
    defaultBranch: 'main',
    url: 'https://github.com/acme/demo-app',
    fullName: 'acme/demo-app',
  },
  links: null,
};

const fakeEnsure = async () => {
  repairCalls += 1;
  return { seeded: false, reason: 'stubbed', filesSeeded: 0 };
};

await syncProjectPreBuildCheckpoint(fakeDb, {
  projectId: project.id,
  project,
  repairProvisionedRepo: false,
  ensureProvisionedRepoMatchesRequirementsFn: fakeEnsure,
});
assert.equal(repairCalls, 0, 'GET-style checkpoint sync should not trigger GitHub repair');

await syncProjectPreBuildCheckpoint(fakeDb, {
  projectId: project.id,
  project,
  repairProvisionedRepo: true,
  ensureProvisionedRepoMatchesRequirementsFn: fakeEnsure,
});
assert.equal(repairCalls, 1, 'mutating checkpoint sync should still allow GitHub repair');

console.log('verify-project-get-does-not-repair-github: ok');

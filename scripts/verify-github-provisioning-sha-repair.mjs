import assert from 'node:assert/strict';
import { ensureProvisionedRepoMatchesRequirements } from '../src/lib/github-provisioning.ts';

process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'test-token';

const originalFetch = global.fetch;
const calls = [];

function okJson(body) {
  return {
    status: 200,
    ok: true,
    json: async () => body,
  };
}

function notFound() {
  return {
    status: 404,
    ok: false,
    statusText: 'Not Found',
    json: async () => ({ message: 'Not Found' }),
  };
}

const existingFiles = new Map([
  ['package.json', { sha: 'sha-package-current', content: JSON.stringify({ name: 'demo' }) }],
  ['app/layout.tsx', { sha: 'sha-layout-current', content: 'existing layout' }],
  ['app/page.tsx', { sha: 'sha-home-current', content: 'existing home' }],
]);

global.fetch = async (url, init = {}) => {
  const href = String(url);
  calls.push({ url: href, init });

  if (href.includes('/contents?ref=')) {
    return okJson([{ path: 'package.json' }]);
  }

  const match = href.match(/\/contents\/([^?]+)\?ref=/);
  if (match && (!init.method || init.method === 'GET')) {
    const filePath = decodeURIComponent(match[1]);
    const existing = existingFiles.get(filePath);
    if (!existing) return notFound();
    return okJson({
      sha: existing.sha,
      content: Buffer.from(existing.content, 'utf8').toString('base64'),
      encoding: 'base64',
    });
  }

  if (init.method === 'PUT') {
    return okJson({ content: { sha: 'updated' } });
  }

  throw new Error(`Unexpected fetch: ${href}`);
};

try {
  const result = await ensureProvisionedRepoMatchesRequirements({
    projectName: 'Demo App',
    requirements: {
      requiredFrameworks: ['nextjs'],
      technologyRequirements: [],
    },
    githubRepoBinding: {
      provider: 'github',
      source: 'provisioned',
      owner: 'acme',
      repo: 'demo-app',
      defaultBranch: 'main',
      url: 'https://github.com/acme/demo-app',
      fullName: 'acme/demo-app',
    },
  });

  assert.equal(result.seeded, true);
  const putCalls = calls.filter((entry) => entry.init?.method === 'PUT');
  assert.ok(putCalls.length >= 1, 'expected at least one PUT repair call');

  const packageUpdate = putCalls.find((entry) => entry.url.includes('/contents/package.json'));
  assert.ok(packageUpdate, 'expected package.json repair call');
  const packageBody = JSON.parse(String(packageUpdate.init.body));
  assert.equal(packageBody.sha, 'sha-package-current');

  const readmeCreate = putCalls.find((entry) => entry.url.includes('/contents/README.md'));
  assert.ok(readmeCreate, 'expected README create call');
  const readmeBody = JSON.parse(String(readmeCreate.init.body));
  assert.equal('sha' in readmeBody, false);

  console.log('verify-github-provisioning-sha-repair: ok');
} finally {
  global.fetch = originalFetch;
}

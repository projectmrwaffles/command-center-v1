import assert from "node:assert/strict";
import { deriveRepoSeedFiles, ensureProvisionedRepoMatchesRequirements } from "../src/lib/github-provisioning.ts";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function installFetchMock(routes) {
  globalThis.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const parsedUrl = new URL(String(url));
    const key = `${method} ${parsedUrl.pathname}${parsedUrl.search}`;
    const fallbackKey = `${method} ${parsedUrl.pathname}`;
    const handler = routes[key] || routes[fallbackKey];
    if (!handler) throw new Error(`Unexpected fetch: ${key}`);
    const result = await handler({ url: parsedUrl, init });
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
}

const requirements = {
  derivedAt: new Date().toISOString(),
  summary: ["Must use Next.js (framework)."],
  constraints: [],
  requiredFrameworks: ["nextjs"],
  sourceCount: 1,
  sources: [{ title: "Spec.pdf", type: "attachment", evidence: ["Use Next.js"] }],
  technologyRequirements: [
    {
      directive: "required",
      kind: "framework",
      rationale: "Use Next.js.",
      choices: [{ slug: "nextjs", label: "Next.js", aliases: ["nextjs", "next.js", "next"], kind: "framework" }],
      sourceTitles: ["Spec.pdf"],
    },
  ],
};

const seedFiles = deriveRepoSeedFiles({ projectName: "Notes Vault 5.5", requirements });
const packageSeed = seedFiles.find((file) => file.path === "package.json");
assert(packageSeed, "expected Next.js package seed");
assert.equal(JSON.parse(packageSeed.content).dependencies.next, "15.5.15");

const seededPaths = [];
installFetchMock({
  "GET /repos/acme-inc/notes-vault-5-5/contents?ref=main": async () => ({ status: 404, body: { message: "This repository is empty." } }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/package.json": async ({ init }) => {
    const payload = JSON.parse(init.body);
    const decoded = JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
    assert.equal(decoded.dependencies.next, "15.5.15");
    seededPaths.push("package.json");
    return { status: 201, body: {} };
  },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/tsconfig.json": async () => { seededPaths.push("tsconfig.json"); return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/next-env.d.ts": async () => { seededPaths.push("next-env.d.ts"); return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/app/layout.tsx": async () => { seededPaths.push("app/layout.tsx"); return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/app/page.tsx": async () => { seededPaths.push("app/page.tsx"); return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/README.md": async () => { seededPaths.push("README.md"); return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/.gitignore": async () => { seededPaths.push(".gitignore"); return { status: 201, body: {} }; },
});

process.env = {
  ...originalEnv,
  VERCEL: "1",
  GITHUB_TOKEN: "runtime-token",
};

const seeded = await ensureProvisionedRepoMatchesRequirements({
  projectName: "Notes Vault 5.5",
  requirements,
  githubRepoBinding: {
    provider: "github",
    owner: "acme-inc",
    repo: "notes-vault-5-5",
    fullName: "acme-inc/notes-vault-5-5",
    url: "https://github.com/acme-inc/notes-vault-5-5",
    source: "provisioned",
    linkedAt: new Date().toISOString(),
    defaultBranch: "main",
    projectLinkKey: "github",
    provisioning: { status: "ready", reason: "Provisioned" },
  },
});

assert.equal(seeded.seeded, true);
assert.equal(seeded.reason, "seeded-empty-provisioned-repo");
assert.deepEqual(seededPaths.sort(), seedFiles.map((file) => file.path).sort());

let putCount = 0;
installFetchMock({
  "GET /repos/acme-inc/notes-vault-5-5/contents?ref=main": async () => ({ status: 200, body: [{ path: "README.md" }] }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/package.json": async () => { putCount += 1; return { status: 201, body: {} }; },
});

const skipped = await ensureProvisionedRepoMatchesRequirements({
  projectName: "Notes Vault 5.5",
  requirements,
  githubRepoBinding: {
    provider: "github",
    owner: "acme-inc",
    repo: "notes-vault-5-5",
    fullName: "acme-inc/notes-vault-5-5",
    url: "https://github.com/acme-inc/notes-vault-5-5",
    source: "provisioned",
    linkedAt: new Date().toISOString(),
    defaultBranch: "main",
    projectLinkKey: "github",
    provisioning: { status: "ready", reason: "Provisioned" },
  },
});

assert.equal(skipped.seeded, false);
assert.equal(skipped.reason, "repo-not-empty");
assert.equal(putCount, 0);

process.env = originalEnv;
globalThis.fetch = originalFetch;
console.log("verify-provisioned-repo-backfill: ok");

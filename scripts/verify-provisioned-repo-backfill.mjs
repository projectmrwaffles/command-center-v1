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
  summary: ["Must use Next.js (framework).", "Must use Tailwind CSS (styling).", "Must use shadcn/ui (tooling)."],
  constraints: [],
  requiredFrameworks: ["nextjs"],
  sourceCount: 1,
  sources: [{ title: "Spec.pdf", type: "attachment", evidence: ["Use Next.js with Tailwind CSS and shadcn/ui"] }],
  technologyRequirements: [
    {
      directive: "required",
      kind: "framework",
      rationale: "Use Next.js.",
      choices: [{ slug: "nextjs", label: "Next.js", aliases: ["nextjs", "next.js", "next"], kind: "framework" }],
      sourceTitles: ["Spec.pdf"],
    },
    {
      directive: "required",
      kind: "styling",
      rationale: "Use Tailwind CSS.",
      choices: [{ slug: "tailwind", label: "Tailwind CSS", aliases: ["tailwind", "tailwindcss", "tailwind css"], kind: "styling" }],
      sourceTitles: ["Spec.pdf"],
    },
    {
      directive: "required",
      kind: "tooling",
      rationale: "Use shadcn/ui.",
      choices: [{ slug: "shadcn-ui", label: "shadcn/ui", aliases: ["shadcn", "shadcn/ui"], kind: "tooling" }],
      sourceTitles: ["Spec.pdf"],
    },
  ],
};

const seedFiles = deriveRepoSeedFiles({ projectName: "Notes Vault 5.5", requirements });
const packageSeed = seedFiles.find((file) => file.path === "package.json");
assert(packageSeed, "expected Next.js package seed");
assert.equal(JSON.parse(packageSeed.content).dependencies.next, "15.5.15");
assert.equal(JSON.parse(packageSeed.content).devDependencies.tailwindcss, "^4");

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
  "PUT /repos/acme-inc/notes-vault-5-5/contents/postcss.config.mjs": async () => { seededPaths.push("postcss.config.mjs"); return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/app/globals.css": async () => { seededPaths.push("app/globals.css"); return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/components.json": async () => { seededPaths.push("components.json"); return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/lib/utils.ts": async () => { seededPaths.push("lib/utils.ts"); return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/components/ui/button.tsx": async () => { seededPaths.push("components/ui/button.tsx"); return { status: 201, body: {} }; },
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
  "GET /repos/acme-inc/notes-vault-5-5/contents/package.json?ref=main": async () => ({ status: 200, body: {
    sha: "pkg-sha",
    encoding: "base64",
    content: Buffer.from(JSON.stringify({
      name: "notes-vault-5-5",
      private: true,
      dependencies: { next: "15.5.15", react: "19.0.0", "react-dom": "19.0.0" },
      devDependencies: { typescript: "^5.8.3", eslint: "^9.24.0", "eslint-config-next": "15.5.15" },
    }), "utf8").toString("base64"),
  } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/tsconfig.json?ref=main": async () => ({ status: 200, body: { sha: "ts-sha", encoding: "base64", content: Buffer.from("{}","utf8").toString("base64") } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/next-env.d.ts?ref=main": async () => ({ status: 200, body: { sha: "env-sha", encoding: "base64", content: Buffer.from("/// <reference types=\"next\" />","utf8").toString("base64") } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/app/layout.tsx?ref=main": async () => ({ status: 200, body: { sha: "layout-sha", encoding: "base64", content: Buffer.from("export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang=\"en\"><body>{children}</body></html>; }","utf8").toString("base64") } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/app/page.tsx?ref=main": async () => ({ status: 200, body: { sha: "page-sha", encoding: "base64", content: Buffer.from("export default function HomePage() { return null; }","utf8").toString("base64") } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/README.md?ref=main": async () => ({ status: 200, body: { sha: "readme-sha", encoding: "base64", content: Buffer.from("# Readme","utf8").toString("base64") } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/.gitignore?ref=main": async () => ({ status: 200, body: { sha: "gitignore-sha", encoding: "base64", content: Buffer.from("node_modules","utf8").toString("base64") } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/postcss.config.mjs?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/app/globals.css?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/components.json?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/lib/utils.ts?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/components/ui/button.tsx?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/package.json": async () => { putCount += 1; return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/postcss.config.mjs": async () => { putCount += 1; return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/app/globals.css": async () => { putCount += 1; return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/components.json": async () => { putCount += 1; return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/lib/utils.ts": async () => { putCount += 1; return { status: 201, body: {} }; },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/components/ui/button.tsx": async () => { putCount += 1; return { status: 201, body: {} }; },
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

assert.equal(skipped.seeded, true);
assert.equal(skipped.reason, "repaired-provisioned-requirement-seed");
assert.equal(putCount, 6);

let racePutAttempts = 0;
let raceTsconfigGetCount = 0;
installFetchMock({
  "GET /repos/acme-inc/notes-vault-5-5/contents?ref=main": async () => ({ status: 200, body: [{ path: "package.json" }] }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/package.json?ref=main": async () => ({ status: 200, body: {
    sha: "pkg-sha-2",
    encoding: "base64",
    content: Buffer.from(packageSeed.content, "utf8").toString("base64"),
  } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/tsconfig.json?ref=main": async () => {
    raceTsconfigGetCount += 1;
    return raceTsconfigGetCount === 1
      ? { status: 404, body: { message: "Not Found" } }
      : { status: 200, body: { sha: "race-sha", encoding: "base64", content: Buffer.from("{}", "utf8").toString("base64") } };
  },
  "GET /repos/acme-inc/notes-vault-5-5/contents/next-env.d.ts?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/app/layout.tsx?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/app/page.tsx?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/README.md?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/.gitignore?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/postcss.config.mjs?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/app/globals.css?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/components.json?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/lib/utils.ts?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "GET /repos/acme-inc/notes-vault-5-5/contents/components/ui/button.tsx?ref=main": async () => ({ status: 404, body: { message: "Not Found" } }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/tsconfig.json": async ({ init }) => {
    const payload = JSON.parse(init.body);
    racePutAttempts += 1;
    if (racePutAttempts === 1) {
      assert.equal(payload.sha, undefined);
      return { status: 422, body: { message: "Invalid request.", errors: [{ message: "\"sha\" wasn't supplied." }] } };
    }
    assert.equal(payload.sha, "race-sha");
    return { status: 200, body: {} };
  },
  "PUT /repos/acme-inc/notes-vault-5-5/contents/next-env.d.ts": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/app/layout.tsx": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/app/page.tsx": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/README.md": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/.gitignore": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/postcss.config.mjs": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/app/globals.css": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/components.json": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/lib/utils.ts": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-5-5/contents/components/ui/button.tsx": async () => ({ status: 201, body: {} }),
});

const raced = await ensureProvisionedRepoMatchesRequirements({
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

assert.equal(raced.seeded, true);
assert.equal(racePutAttempts, 2, "expected sha-less race to retry with fetched sha");

process.env = originalEnv;
globalThis.fetch = originalFetch;
console.log("verify-provisioned-repo-backfill: ok");

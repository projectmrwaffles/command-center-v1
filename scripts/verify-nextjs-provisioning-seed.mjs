import assert from "node:assert/strict";
import { deriveRepoSeedFiles, provisionGitHubRepoForProject } from "../src/lib/github-provisioning.ts";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function installFetchMock(routes) {
  globalThis.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const parsedUrl = new URL(String(url));
    const key = `${method} ${parsedUrl.pathname}`;
    const handler = routes[key];
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
  sources: [{ title: "Spec.pdf", type: "attachment", evidence: ["Next.js + React with Tailwind CSS and shadcn/ui"] }],
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

const seedFiles = deriveRepoSeedFiles({ projectName: "Notes Vault 1.3", requirements });
const packageSeed = seedFiles.find((file) => file.path === "package.json");
assert(packageSeed, "expected Next.js seed package.json");
const pkg = JSON.parse(packageSeed.content);
assert.equal(pkg.scripts.dev, "next dev");
assert.equal(pkg.dependencies.next, "15.5.15");
assert.equal(pkg.dependencies.react, "19.0.0");
assert.equal(pkg.devDependencies.tailwindcss, "^4");
assert.equal(pkg.devDependencies["@tailwindcss/postcss"], "^4");
assert.equal(pkg.dependencies["class-variance-authority"], "^0.7.1");
assert.ok(!pkg.devDependencies?.vite, "seed must not include vite");
assert(seedFiles.some((file) => file.path === "postcss.config.mjs"), "expected Tailwind postcss config to be seeded");
assert(seedFiles.some((file) => file.path === "app/globals.css"), "expected Tailwind globals.css to be seeded");
assert(seedFiles.some((file) => file.path === "components.json"), "expected shadcn components.json to be seeded");
assert(seedFiles.some((file) => file.path === "components/ui/button.tsx"), "expected sample shadcn component to be seeded");

installFetchMock({
  "GET /users/acme-inc": async () => ({ body: { login: "acme-inc", type: "Organization" } }),
  "GET /repos/acme-inc/notes-vault-1-3-123456": async () => ({ status: 404, body: { message: "Not Found" } }),
  "POST /orgs/acme-inc/repos": async ({ init }) => {
    const payload = JSON.parse(init.body);
    assert.equal(payload.name, "notes-vault-1-3-123456");
    return {
      status: 201,
      body: {
        html_url: "https://github.com/acme-inc/notes-vault-1-3-123456",
        default_branch: "main",
      },
    };
  },
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/package.json": async ({ init }) => {
    const payload = JSON.parse(init.body);
    const decoded = Buffer.from(payload.content, "base64").toString("utf8");
    const packageJson = JSON.parse(decoded);
    assert.equal(payload.branch, "main");
    assert.equal(packageJson.scripts.dev, "next dev");
    assert.equal(packageJson.devDependencies.tailwindcss, "^4");
    assert.equal(packageJson.devDependencies["@tailwindcss/postcss"], "^4");
    assert.equal(packageJson.dependencies["class-variance-authority"], "^0.7.1");
    assert.ok(!packageJson.devDependencies?.vite);
    return { status: 201, body: { content: { path: "package.json" } } };
  },
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/tsconfig.json": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/next-env.d.ts": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/app/layout.tsx": async ({ init }) => {
    const payload = JSON.parse(init.body);
    const decoded = Buffer.from(payload.content, "base64").toString("utf8");
    assert.match(decoded, /RootLayout/);
    return { status: 201, body: {} };
  },
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/app/page.tsx": async ({ init }) => {
    const payload = JSON.parse(init.body);
    const decoded = Buffer.from(payload.content, "base64").toString("utf8");
    assert.match(decoded, /Notes Vault 1.3/);
    return { status: 201, body: {} };
  },
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/README.md": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/.gitignore": async () => ({ status: 201, body: {} }),
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/postcss.config.mjs": async ({ init }) => {
    const payload = JSON.parse(init.body);
    const decoded = Buffer.from(payload.content, "base64").toString("utf8");
    assert.match(decoded, /@tailwindcss\/postcss/);
    return { status: 201, body: {} };
  },
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/app/globals.css": async ({ init }) => {
    const payload = JSON.parse(init.body);
    const decoded = Buffer.from(payload.content, "base64").toString("utf8");
    assert.match(decoded, /tailwindcss/);
    return { status: 201, body: {} };
  },
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/components.json": async ({ init }) => {
    const payload = JSON.parse(init.body);
    const decoded = Buffer.from(payload.content, "base64").toString("utf8");
    assert.match(decoded, /shadcn/);
    return { status: 201, body: {} };
  },
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/lib/utils.ts": async ({ init }) => {
    const payload = JSON.parse(init.body);
    const decoded = Buffer.from(payload.content, "base64").toString("utf8");
    assert.match(decoded, /tailwind-merge/);
    return { status: 201, body: {} };
  },
  "PUT /repos/acme-inc/notes-vault-1-3-123456/contents/components/ui/button.tsx": async ({ init }) => {
    const payload = JSON.parse(init.body);
    const decoded = Buffer.from(payload.content, "base64").toString("utf8");
    assert.match(decoded, /class-variance-authority/);
    return { status: 201, body: {} };
  },
});

process.env = {
  ...originalEnv,
  GITHUB_TOKEN: "runtime-token",
  GH_TOKEN: "",
  GITHUB_PROVISIONING_OWNER: "acme-inc",
};

const binding = await provisionGitHubRepoForProject({
  projectId: "12345678-1234-1234-1234-1234567890ab",
  projectName: "Notes Vault 1.3",
  description: "Provision Notes Vault 1.3",
  requirements,
});

assert.equal(binding.fullName, "acme-inc/notes-vault-1-3-123456");
assert.equal(binding.source, "provisioned");

process.env = originalEnv;
globalThis.fetch = originalFetch;
console.log("verify-nextjs-provisioning-seed: ok");

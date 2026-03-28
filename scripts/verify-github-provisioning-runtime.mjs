import assert from "node:assert/strict";
import { provisionGitHubRepoForProject, verifyGitHubCliRuntime } from "../src/lib/github-provisioning.ts";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function installFetchMock(routes) {
  globalThis.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const parsedUrl = new URL(String(url));
    const key = `${method} ${parsedUrl.pathname}`;
    const handler = routes[key];

    if (!handler) {
      throw new Error(`Unexpected fetch: ${key}`);
    }

    const result = await handler({ url: parsedUrl, init });
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
}

async function expectProvisioningFailure(overrides, pattern, label) {
  process.env = { ...originalEnv, ...overrides };

  try {
    await provisionGitHubRepoForProject({
      projectId: "12345678-1234-1234-1234-1234567890ab",
      projectName: "Runtime Provisioning Test",
      description: "Runtime verification",
    });
    assert.fail(`${label}: expected provisioning to fail`);
  } catch (error) {
    assert.match(String(error instanceof Error ? error.message : error), pattern, label);
  }
}

await expectProvisioningFailure(
  {
    GITHUB_TOKEN: "",
    GH_TOKEN: "",
    GITHUB_PROVISIONING_OWNER: "",
  },
  /GitHub API authentication is missing/i,
  "missing token should produce actionable runtime error"
);

installFetchMock({
  "GET /user": async ({ init }) => {
    assert.match(String(init.headers.Authorization), /^Bearer runtime-token$/);
    return { body: { login: "octocat", type: "User" } };
  },
  "GET /users/acme-inc": async () => ({ body: { login: "acme-inc", type: "Organization" } }),
  "GET /repos/acme-inc/runtime-provisioning-test-123456": async () => ({ status: 404, body: { message: "Not Found" } }),
  "POST /orgs/acme-inc/repos": async ({ init }) => {
    const payload = JSON.parse(init.body);
    assert.equal(payload.name, "runtime-provisioning-test-123456");
    assert.equal(payload.private, true);
    assert.equal(payload.auto_init, true);
    return {
      status: 201,
      body: {
        html_url: "https://github.com/acme-inc/runtime-provisioning-test-123456",
        default_branch: "main",
      },
    };
  },
});

process.env = {
  ...originalEnv,
  GITHUB_TOKEN: "runtime-token",
  GH_TOKEN: "",
  GITHUB_PROVISIONING_OWNER: "acme-inc",
};

const runtime = await verifyGitHubCliRuntime();
assert.equal(runtime.executable, "github-rest-api", "runtime verification should use the server-safe API path");
assert.match(runtime.version, /authenticated as octocat/i, "runtime verification should resolve the authenticated viewer");

const binding = await provisionGitHubRepoForProject({
  projectId: "12345678-1234-1234-1234-1234567890ab",
  projectName: "Runtime Provisioning Test",
  description: "Runtime verification",
});

assert.equal(binding.fullName, "acme-inc/runtime-provisioning-test-123456");
assert.equal(binding.url, "https://github.com/acme-inc/runtime-provisioning-test-123456");
assert.equal(binding.source, "provisioned");
assert.equal(binding.provisioning?.status, "ready");

process.env = originalEnv;
globalThis.fetch = originalFetch;
console.log("verify-github-provisioning-runtime: ok");

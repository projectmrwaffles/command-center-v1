import assert from "node:assert/strict";
import dotenv from "dotenv";

const envResult = dotenv.config({ path: ".env.local" });
if (envResult.error) {
  console.warn("[verify] .env.local not loaded:", envResult.error.message);
}

const { getGitHubProvisioningReadiness } = await import("../src/lib/github-provisioning.ts");
const { formatCreateProjectError } = await import("../src/hooks/use-create-project.ts");

const codeHeavyInput = {
  type: "web_app",
  intake: {
    projectOrigin: "new",
    shape: "web-app",
    capabilities: ["frontend"],
    context: [],
    summary: "Net-new web app",
    goals: "Provision a new repo automatically",
  },
  existingGitHubUrl: null,
  provisionGithubRepo: undefined,
};

const originalGithubToken = process.env.GITHUB_TOKEN;
const originalGhToken = process.env.GH_TOKEN;

try {
  const authPresent = getGitHubProvisioningReadiness(codeHeavyInput);
  assert.equal(authPresent.requiresProvisioning, true, "Expected code-heavy net-new input to require provisioning");
  assert.equal(authPresent.ok, true, "Expected readiness to pass when runtime auth is present");

  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;

  const authMissing = getGitHubProvisioningReadiness(codeHeavyInput);
  assert.equal(authMissing.ok, false, "Expected readiness to fail when runtime auth is missing");
  assert.equal(authMissing.code, "GITHUB_PROVISIONING_AUTH_MISSING");
  assert.match(authMissing.error || "", /needs a new GitHub repo/i);
  assert.match(authMissing.nextAction || "", /GITHUB_TOKEN.*GH_TOKEN/i);

  const surfacedMessage = formatCreateProjectError({
    error: authMissing.error,
    details: authMissing.nextAction,
    code: authMissing.code,
  }, 412);

  assert.match(surfacedMessage, /current server runtime/i);
  assert.match(surfacedMessage, /Set GITHUB_TOKEN/i);

  console.log(JSON.stringify({
    authPresent: {
      ok: authPresent.ok,
      requiresProvisioning: authPresent.requiresProvisioning,
      authConfigured: authPresent.authConfigured,
    },
    authMissing: {
      ok: authMissing.ok,
      code: authMissing.code,
      error: authMissing.error,
      nextAction: authMissing.nextAction,
    },
    surfacedMessage,
  }, null, 2));
} finally {
  if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalGithubToken;

  if (originalGhToken === undefined) delete process.env.GH_TOKEN;
  else process.env.GH_TOKEN = originalGhToken;
}

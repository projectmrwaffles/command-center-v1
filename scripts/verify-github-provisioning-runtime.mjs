import assert from "node:assert/strict";
import { provisionGitHubRepoForProject, verifyGitHubCliRuntime } from "../src/lib/github-provisioning.ts";

const originalEnv = { ...process.env };

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
    PATH: "/tmp/openclaw-gh-missing",
    GITHUB_CLI_PATH: "/tmp/openclaw-gh-missing/gh",
    GH_PATH: "/tmp/openclaw-gh-missing/gh",
    GITHUB_PROVISIONING_OWNER: "",
    OPENCLAW_DISABLE_GH_FALLBACK: "1",
    OPENCLAW_DISABLE_GH_PATH_AUGMENTATION: "1",
  },
  /GitHub repo auto-provisioning is unavailable in this runtime because the GitHub CLI could not be found/i,
  "missing gh should produce actionable runtime error"
);

process.env = {
  ...originalEnv,
  PATH: "/tmp/openclaw-gh-missing",
  GITHUB_CLI_PATH: "/opt/homebrew/bin/gh",
  GH_PATH: "/opt/homebrew/bin/gh",
};

const runtime = await verifyGitHubCliRuntime();
assert.equal(runtime.executable, "/opt/homebrew/bin/gh", "explicit gh path should be honored in a stripped PATH runtime");
assert.match(runtime.version, /gh version/i, "runtime verification should resolve gh version output");

process.env = originalEnv;
console.log("verify-github-provisioning-runtime: ok");

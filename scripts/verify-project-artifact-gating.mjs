import assert from "node:assert/strict";
import { getProjectArtifactIntegrity } from "../src/lib/project-artifact-requirements.ts";

const blockedCodeHeavy = getProjectArtifactIntegrity(
  {
    type: "product_build",
    intake: { shape: "web-app", capabilities: ["frontend"], projectOrigin: "existing" },
    links: { docs: "https://docs.acme.com/spec" },
    github_repo_binding: null,
  },
  [{ task_type: "build_implementation" }],
);

assert.equal(blockedCodeHeavy.requiresGitHubRepo, true);
assert.equal(blockedCodeHeavy.hasGitHubRepo, false);
assert.equal(blockedCodeHeavy.pendingProvisioning, false);
assert.equal(blockedCodeHeavy.completionBlocked, true);
assert.equal(blockedCodeHeavy.completionCapPct, 95);
assert.match(blockedCodeHeavy.blockingReason || "", /GitHub repo/i);

const pendingProvisioning = getProjectArtifactIntegrity(
  {
    type: "product_build",
    intake: { shape: "web-app", capabilities: ["frontend"], projectOrigin: "new" },
    links: { docs: "https://docs.acme.com/spec" },
    github_repo_binding: null,
  },
  [{ task_type: "build_implementation" }],
);

assert.equal(pendingProvisioning.requiresGitHubRepo, true);
assert.equal(pendingProvisioning.hasGitHubRepo, false);
assert.equal(pendingProvisioning.pendingProvisioning, true);
assert.equal(pendingProvisioning.completionBlocked, false);
assert.equal(pendingProvisioning.completionCapPct, null);
assert.equal(pendingProvisioning.blockingReason, null);
assert.match(pendingProvisioning.pendingProvisioningReason || "", /provisioning/i);

const readyCodeHeavy = getProjectArtifactIntegrity(
  {
    type: "product_build",
    intake: { shape: "web-app", capabilities: ["frontend", "backend-data"] },
    links: { github: "https://github.com/vercel/next.js" },
    github_repo_binding: null,
  },
  [{ task_type: "build_implementation" }],
);

assert.equal(readyCodeHeavy.requiresGitHubRepo, true);
assert.equal(readyCodeHeavy.hasGitHubRepo, true);
assert.equal(readyCodeHeavy.completionBlocked, false);
assert.equal(readyCodeHeavy.blockingReason, null);

const nonCodeHeavy = getProjectArtifactIntegrity(
  {
    type: "marketing_growth",
    intake: { shape: "launch-campaign", capabilities: ["content-copy"] },
    links: { docs: "https://docs.acme.com/campaign" },
  },
  [{ task_type: "content_messaging" }],
);

assert.equal(nonCodeHeavy.requiresGitHubRepo, false);
assert.equal(nonCodeHeavy.completionBlocked, false);

console.log("verify-project-artifact-gating: ok");

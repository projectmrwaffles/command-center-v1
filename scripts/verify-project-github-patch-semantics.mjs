import assert from "node:assert/strict";
import {
  createGitHubRepoBinding,
  getGitHubRepoProvenance,
  getGitHubRepoValidationError,
  getNetNewGitHubRepoGuardError,
  mergeProjectLinksForGitHubUpdate,
} from "../src/lib/github-repo-binding.ts";
import { sanitizeProjectLinks } from "../src/lib/project-links.ts";

const existingBinding = createGitHubRepoBinding(
  { url: "https://github.com/acme/platform", defaultBranch: "main", installationId: 42 },
  null
);
assert(existingBinding, "expected existing binding");

const existingLinks = {
  github: "https://github.com/acme/platform",
  docs: "https://docs.acme.test/project",
  preview: "https://preview.acme.test",
};

const relinkedSameRepo = createGitHubRepoBinding(
  { url: "github.com/acme/platform" },
  existingBinding
);
assert(relinkedSameRepo, "same repo binding should exist");
assert.equal(relinkedSameRepo.linkedAt, existingBinding.linkedAt, "same repo relink should preserve linkedAt");
assert.equal(relinkedSameRepo.defaultBranch, "main", "same repo relink should preserve defaultBranch");
assert.equal(relinkedSameRepo.installationId, 42, "same repo relink should preserve installationId");

const mergedWithoutLinksPayload = mergeProjectLinksForGitHubUpdate(existingLinks, undefined, relinkedSameRepo);
assert.deepEqual(mergedWithoutLinksPayload, existingLinks, "omitting links should preserve non-GitHub links");

const unlinkedWithoutLinksPayload = mergeProjectLinksForGitHubUpdate(existingLinks, undefined, null);
assert.deepEqual(
  unlinkedWithoutLinksPayload,
  {
    docs: "https://docs.acme.test/project",
    preview: "https://preview.acme.test",
  },
  "unlinking GitHub should only remove the GitHub link when links are omitted"
);

const explicitFullEdit = mergeProjectLinksForGitHubUpdate(
  existingLinks,
  sanitizeProjectLinks({ docs: "https://handbook.acme.test/project" }),
  null,
  { replaceAll: true }
);
assert.deepEqual(
  explicitFullEdit,
  { docs: "https://handbook.acme.test/project" },
  "explicit full link edits should replace the full links object"
);

assert.equal(
  getGitHubRepoValidationError("https://github.com/example/repo"),
  "GitHub repo must be a real github.com/<owner>/<repo> URL. Placeholder or non-repo links are not allowed.",
  "placeholder/fake GitHub repos must stay rejected"
);

assert.match(
  getNetNewGitHubRepoGuardError({
    projectOrigin: "new",
    githubRepoUrl: "https://github.com/acme/platform",
    confirmLinkedRepo: false,
  }) || "",
  /cannot silently inherit/i,
  "net-new projects with linked repos must hard-fail unless explicitly confirmed"
);

assert.equal(
  getNetNewGitHubRepoGuardError({
    projectOrigin: "existing",
    githubRepoUrl: "https://github.com/acme/platform",
    confirmLinkedRepo: false,
  }),
  null,
  "existing-project flows should still allow linking an existing repo"
);

const linkedProvenance = getGitHubRepoProvenance({ binding: existingBinding, projectOrigin: "new" });
assert.equal(linkedProvenance.label, "linked existing repo");
assert.equal(linkedProvenance.mismatch, true, "net-new + linked repo should surface mismatch state");

const provisionedBinding = createGitHubRepoBinding({
  url: "https://github.com/acme/workspace",
  source: "provisioned",
  provisioning: { status: "ready", reason: "Provisioned." },
});
assert(provisionedBinding, "expected provisioned binding");
const provisionedProvenance = getGitHubRepoProvenance({ binding: provisionedBinding, projectOrigin: "new" });
assert.equal(provisionedProvenance.label, "auto-provisioned repo");
assert.equal(provisionedProvenance.mismatch, false);

assert.equal(getGitHubRepoProvenance({ binding: null, projectOrigin: "new" }).label, "no repo yet");

console.log("verify-project-github-patch-semantics: ok");

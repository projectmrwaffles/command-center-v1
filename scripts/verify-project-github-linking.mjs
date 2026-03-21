import assert from "node:assert/strict";
import { createGitHubRepoBinding, getGitHubRepoValidationError, parseGitHubRepoUrl, syncProjectLinksWithGitHubBinding } from "../src/lib/github-repo-binding.ts";

const parsed = parseGitHubRepoUrl("https://github.com/vercel/next.js/issues");
assert(parsed, "expected repo URL to parse");
assert.equal(parsed.fullName, "vercel/next.js");
assert.equal(parsed.url, "https://github.com/vercel/next.js");

assert.equal(
  getGitHubRepoValidationError("https://github.com/example/repo"),
  "GitHub repo must be a real github.com/<owner>/<repo> URL. Placeholder or non-repo links are not allowed.",
  "placeholder repo should be rejected"
);

const binding = createGitHubRepoBinding({ url: "github.com/octocat/Hello-World" });
assert(binding, "binding should be created from a valid repo URL");
assert.equal(binding.fullName, "octocat/Hello-World");
assert.equal(binding.projectLinkKey, "github");

const syncedLinks = syncProjectLinksWithGitHubBinding({ docs: "https://docs.example.org/project" }, binding);
assert.deepEqual(syncedLinks, {
  docs: "https://docs.example.org/project",
  github: "https://github.com/octocat/Hello-World",
});

const clearedLinks = syncProjectLinksWithGitHubBinding({ github: "https://github.com/octocat/Hello-World" }, null);
assert.equal(clearedLinks, null);

console.log("verify-project-github-linking: ok");

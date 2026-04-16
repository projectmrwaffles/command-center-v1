const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();
const listenerPath = path.join(repoRoot, "scripts", "agent-listener.js");
const listener = fs.readFileSync(listenerPath, "utf8");

const assertions = [
  {
    name: "listener resolves repo slug from GitHub repo URL",
    ok: listener.includes("function getRepoSlugFromUrl(url)") && listener.includes("github\\.com[/:]([^/]+)\\/([^/]+)$"),
    detail: "repo-backed task dispatch should derive the local repo name from the bound GitHub URL",
  },
  {
    name: "listener resolves a concrete repo workspace path for repo-backed projects",
    ok: listener.includes("function resolveRepoWorkspacePath(project)") && listener.includes('workspace-product-lead", "projects", repoSlug'),
    detail: "dispatch should provide the actual local repo clone path instead of a vague workspace instruction",
  },
  {
    name: "listener hydrates a missing repo workspace before dispatch",
    ok: listener.includes("function hydrateRepoWorkspaceFromGitHub(repoUrl, targetDir)") && listener.includes('git", ["clone", authenticatedUrl, targetDir]'),
    detail: "fresh auto-provisioned repos created on Vercel should still materialize a concrete local workspace before discovery/build agents are told to use it",
  },
  {
    name: "agent message includes repo workspace path and forbids scratch workspaces",
    ok:
      listener.includes("Repo workspace path:") &&
      listener.includes("Use the exact repo workspace path above when you inspect or change implementation files; do not work in a separate scratch workspace."),
    detail: "prevents the exact Task App V6 failure where build work landed outside the repo-bound workspace and QA reviewed an empty repo",
  },
];

let failed = false;
for (const assertion of assertions) {
  const prefix = assertion.ok ? "PASS" : "FAIL";
  console.log(`${prefix} - ${assertion.name}: ${assertion.detail}`);
  if (!assertion.ok) failed = true;
}

if (failed) process.exit(1);

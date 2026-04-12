import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sandboxCwd = fs.mkdtempSync(path.join(os.tmpdir(), "ccv1-home-empty-"));
const childScript = path.join(sandboxCwd, "child-check.mjs");
const project = {
  name: "HOME empty regression",
  type: "web_app",
  links: { github: "https://github.com/acme-inc/home-empty-repro" },
  intake: { links: { github: "https://github.com/acme-inc/home-empty-repro" } },
  github_repo_binding: { url: "https://github.com/acme-inc/home-empty-repro" },
};

const childLines = [
  'import assert from "node:assert/strict";',
  'import fs from "node:fs";',
  'import path from "node:path";',
  `import { getProvisionedRepoWorkspaceTargets } from ${JSON.stringify(path.join(repoRoot, "src/lib/github-provisioning.ts"))};`,
  `import { resolveRepoWorkspacePath } from ${JSON.stringify(path.join(repoRoot, "src/lib/project-requirements.ts"))};`,
  `import listenerModule from ${JSON.stringify(path.join(repoRoot, "scripts/agent-listener.js"))};`,
  `const project = ${JSON.stringify(project)};`,
  'const openClawRoot = listenerModule.resolveOpenClawRoot();',
  'assert.ok(path.isAbsolute(openClawRoot), "openClaw root should stay absolute");',
  'const workspaceTargets = getProvisionedRepoWorkspaceTargets("home-empty-repro");',
  'assert.equal(workspaceTargets.length, 3, "expected mirrored workspace targets");',
  'for (const target of workspaceTargets) {',
  '  assert.ok(path.isAbsolute(target), `workspace target must be absolute: ${target}`);',
  '  fs.rmSync(target, { recursive: true, force: true });',
  '  fs.mkdirSync(target, { recursive: true });',
  '}',
  'fs.writeFileSync(path.join(workspaceTargets[1], "package.json"), JSON.stringify({ dependencies: { next: "15.3.0" } }), "utf8");',
  'const resolvedFromRequirements = resolveRepoWorkspacePath(project);',
  'assert.ok(workspaceTargets.includes(resolvedFromRequirements), `repo lookup should resolve one mirrored workspace path: ${resolvedFromRequirements}`);',
  'const resolvedFromListener = listenerModule.resolveRepoWorkspacePath(project);',
  'assert.ok(workspaceTargets.includes(resolvedFromListener), `listener repo lookup should resolve one mirrored workspace path: ${resolvedFromListener}`);',
  'const message = listenerModule.buildAgentMessage({ project, taskTitle: "Check repo workspace", taskId: "task-1", projectId: "project-1", taskType: "implementation", taskMetadata: {} });',
  'assert.match(message, /Repo workspace path:/, "listener message should mention repo workspace path");',
  'const escapedWorkspacePath = resolvedFromListener.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");',
  'assert.match(message, new RegExp(escapedWorkspacePath), "listener message should include absolute repo workspace path");',
  'for (const target of workspaceTargets) fs.rmSync(target, { recursive: true, force: true });',
  'console.log(JSON.stringify({ openClawRoot, workspaceTargets, resolvedFromRequirements, resolvedFromListener, cwd: process.cwd() }));',
];
fs.writeFileSync(childScript, `${childLines.join("\n")}\n`, "utf8");

const result = spawnSync(process.execPath, ["--experimental-strip-types", childScript], {
  cwd: sandboxCwd,
  env: { ...process.env, HOME: "" },
  encoding: "utf8",
});

if (result.status !== 0) {
  process.stderr.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  throw new Error(`fresh-process regression failed with status ${result.status}`);
}

const output = JSON.parse(result.stdout.trim());
assert.ok(path.isAbsolute(output.openClawRoot), "child process should report absolute openClaw root");
for (const target of output.workspaceTargets) {
  assert.ok(path.isAbsolute(target), `child process target should be absolute: ${target}`);
}
assert.equal(fs.existsSync(path.join(sandboxCwd, ".openclaw")), false, "fresh process must not create a relative .openclaw directory in cwd");

fs.rmSync(childScript, { force: true });
fs.rmSync(sandboxCwd, { recursive: true, force: true });
console.log("verify-home-empty-openclaw-root: ok");

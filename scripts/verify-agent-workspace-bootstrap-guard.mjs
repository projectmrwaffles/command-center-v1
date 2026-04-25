#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cc-agent-bootstrap-guard-"));
const openClawRoot = path.join(tempRoot, ".openclaw");
const backendWorkspace = path.join(openClawRoot, "workspace-backend-engineer");
const techLeadWorkspace = path.join(openClawRoot, "workspace-tech-lead-architect");

await fs.mkdir(backendWorkspace, { recursive: true });
await fs.mkdir(techLeadWorkspace, { recursive: true });
await fs.writeFile(path.join(backendWorkspace, "BOOTSTRAP.md"), "bootstrap pending\n", "utf8");

process.env.OPENCLAW_ROOT = openClawRoot;

const dispatchModule = await import("../src/lib/agent-dispatch.ts");

assert.equal(dispatchModule.resolveAgentWorkspacePath("backend-engineer"), backendWorkspace);
assert.equal(dispatchModule.resolveAgentWorkspacePath("main"), path.join(openClawRoot, "workspace"));

const blocked = await dispatchModule.getAgentWorkspaceBootstrapState("11111111-1111-1111-1111-000000000008");
assert.equal(blocked.ready, false, "backend engineer should be blocked when BOOTSTRAP.md exists");
if (!blocked.ready) {
  assert.equal(blocked.workspacePath, backendWorkspace);
  assert.equal(blocked.bootstrapPath, path.join(backendWorkspace, "BOOTSTRAP.md"));
  assert.match(blocked.reason, /^bootstrap_pending:backend-engineer:/);
}

const ready = await dispatchModule.getAgentWorkspaceBootstrapState("11111111-1111-1111-1111-000000000006");
assert.equal(ready.ready, true, "tech lead should be ready without BOOTSTRAP.md");
if (ready.ready) {
  assert.equal(ready.workspacePath, techLeadWorkspace);
}

await fs.rm(tempRoot, { recursive: true, force: true });
console.log("verify-agent-workspace-bootstrap-guard: ok");

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const listenerPath = path.join(repoRoot, "scripts", "agent-listener.js");
const handoffPath = path.join(repoRoot, "src", "lib", "project-handoff.ts");
const statePath = path.join(repoRoot, "src", "lib", "project-state.ts");
const aliasPath = path.join(repoRoot, "scripts", "register-ts-aliases.mjs");
const truthPath = path.join(repoRoot, "src", "lib", "project-truth.ts");
const projectPagePath = path.join(repoRoot, "src", "app", "projects", "[id]", "page.tsx");
const listener = fs.readFileSync(listenerPath, "utf8");
const truthSource = fs.readFileSync(truthPath, "utf8");
const projectPageSource = fs.readFileSync(projectPagePath, "utf8");

assert.ok(listener.includes("await import(path.join(REPO_ROOT, 'scripts/register-ts-aliases.mjs'))"), "listener fallback should register TS aliases before importing TS runtime helpers");
assert.ok(listener.includes("src/lib/project-handoff.ts") || listener.includes("import(path.join(REPO_ROOT, 'src/lib/project-handoff.ts'))"), "listener fallback should reference the real project handoff module");
assert.ok(!listener.includes("src/lib/task-completion-handoff.ts"), "listener fallback should not reference the removed task-completion handoff helper");
assert.ok(listener.includes("await maybeAdvanceProjectAfterTaskDone(adminSupabase"), "listener done-path should attempt project progression fallback");
assert.ok(listener.includes("completedTaskId: taskId"), "listener done-path should pass the completed task id into progression reconciliation");
assert.ok(listener.includes("await syncProjectState(adminSupabase, projectId);"), "listener fallback should still sync project state after reconciliation");

await import(pathToFileURL(aliasPath).href);
const stateModule = await import(pathToFileURL(statePath).href);
const handoffModule = await import(pathToFileURL(handoffPath).href);

assert.equal(typeof stateModule.syncProjectState, "function", "alias-registered fallback should load syncProjectState");
assert.equal(typeof handoffModule.maybeAdvanceProjectAfterTaskDone, "function", "alias-registered fallback should load maybeAdvanceProjectAfterTaskDone");

assert.ok(truthSource.includes('key: "stuck_progression"'), "project truth should expose a stuck progression execution state");
assert.ok(truthSource.includes('reason: "phase_complete_not_advanced"'), "guardrail should label the stalled handoff reason");
assert.ok(truthSource.includes('guardrails: {') && truthSource.includes('stuckWorkflow: stuckWorkflowGuardrail'), "project truth should return the stuck workflow guardrail payload");
assert.ok(projectPageSource.includes('truth?.guardrails?.stuckWorkflow'), "project page should read the stuck workflow guardrail");
assert.ok(projectPageSource.includes('Workflow guardrail:'), "project page should visibly surface the stuck workflow guardrail");

console.log("verify-phase-progression-guardrails: ok");

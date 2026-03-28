const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();
const listenerPath = path.join(repoRoot, "scripts", "agent-listener.js");
const handoffPath = path.join(repoRoot, "src", "lib", "project-handoff.ts");
const listener = fs.readFileSync(listenerPath, "utf8");

const assertions = [
  {
    name: "legacy listener fallback imports project handoff module",
    ok: listener.includes("src/lib/project-handoff.ts") && fs.existsSync(handoffPath),
    detail: "fallback should import the real phase handoff module, not a missing task-completion helper",
  },
  {
    name: "legacy listener fallback no longer references missing task-completion handoff module",
    ok: !listener.includes("src/lib/task-completion-handoff.ts"),
    detail: "prevents the exact production stale-phase path caused by the missing import",
  },
  {
    name: "done fallback syncs project state and advances phases with completedTaskId",
    ok:
      listener.includes("await syncProjectState(adminSupabase, projectId);") &&
      listener.includes("await maybeAdvanceProjectAfterTaskDone(adminSupabase") &&
      listener.includes("completedTaskId: taskId"),
    detail: "done-path fallback now performs the same state sync + advancement sequence as the API flow",
  },
];

let failed = false;
for (const assertion of assertions) {
  const prefix = assertion.ok ? "PASS" : "FAIL";
  console.log(`${prefix} - ${assertion.name}: ${assertion.detail}`);
  if (!assertion.ok) failed = true;
}

if (failed) process.exit(1);

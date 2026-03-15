const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();
const apiRoot = path.join(repoRoot, "src", "app", "api");

function walk(dir, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, list);
    else if (entry.isFile() && entry.name === "route.ts") list.push(fullPath);
  }
  return list;
}

const routeFiles = walk(apiRoot).sort();
const missingAuth = [];
for (const file of routeFiles) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes("authorizeApiRequest") && !text.includes("hasBearerToken")) {
    missingAuth.push(path.relative(repoRoot, file));
  }
}

const agentLogPath = path.join(apiRoot, "agent", "log", "route.ts");
const docsRoutePath = path.join(apiRoot, "projects", "[id]", "documents", "route.ts");
const projectsRoutePath = path.join(apiRoot, "projects", "route.ts");

const agentLog = fs.readFileSync(agentLogPath, "utf8");
const docsRoute = fs.readFileSync(docsRoutePath, "utf8");
const projectsRoute = fs.readFileSync(projectsRoutePath, "utf8");

const assertions = [
  {
    name: "all API routes have auth guards",
    ok: missingAuth.length === 0,
    detail: missingAuth.length === 0 ? `${routeFiles.length} guarded routes found` : `Missing auth: ${missingAuth.join(", ")}`,
  },
  {
    name: "agent task updates validate project scope",
    ok: agentLog.includes("Task does not belong to the provided project") && agentLog.includes('.eq("project_id", existingTask.project_id)'),
    detail: "agent/log task_update now checks existing task scope before update",
  },
  {
    name: "project documents verify project existence and sanitize payload",
    ok: docsRoute.includes("projectExists") && docsRoute.includes("sanitizeDocuments") && docsRoute.includes("Project not found"),
    detail: "documents route now validates parent project + fields",
  },
  {
    name: "project trigger path has no hardcoded production fallback URL",
    ok: !projectsRoute.includes("command-center-v1.vercel.app"),
    detail: "agent trigger uses configured app URL only",
  },
];

let failed = false;
for (const assertion of assertions) {
  const prefix = assertion.ok ? "PASS" : "FAIL";
  console.log(`${prefix} - ${assertion.name}: ${assertion.detail}`);
  if (!assertion.ok) failed = true;
}

if (failed) {
  process.exit(1);
}

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { maybeAdvanceProjectAfterTaskDone } from "../src/lib/project-handoff.ts";

const repoRoot = process.cwd();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, ".env.local"));

assert.ok(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL is required");
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY is required");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const created = {
  projectId: null,
  sprintIds: [],
  taskIds: [],
};

async function cleanup() {
  if (!created.projectId) return;
  try {
    if (created.taskIds.length) {
      await db.from("agent_notifications").delete().in("task_id", created.taskIds);
    }
  } catch {}
  await db.from("agent_events").delete().eq("project_id", created.projectId);
  await db.from("jobs").delete().eq("project_id", created.projectId);
  await db.from("approvals").delete().eq("project_id", created.projectId);
  await db.from("milestone_submissions").delete().in("sprint_id", created.sprintIds.length ? created.sprintIds : ["00000000-0000-0000-0000-000000000000"]);
  await db.from("sprint_items").delete().eq("project_id", created.projectId);
  await db.from("sprints").delete().eq("project_id", created.projectId);
  await db.from("projects").delete().eq("id", created.projectId);
}

try {
  const { data: agents, error: agentsError } = await db
    .from("agents")
    .select("id, name")
    .not("name", "like", "_archived_%")
    .order("created_at", { ascending: true })
    .limit(3);
  assert.equal(agentsError, null, agentsError?.message || "Failed to load fixture agents");
  assert.ok((agents || []).length >= 2, "Expected at least two active agents for verification");

  const [discoveryAgent, buildAgent] = agents;
  const now = Date.now();
  const projectName = `Verify Live Discovery Handoff ${now}`;

  const projectInsert = await db.from("projects").insert({
    name: projectName,
    type: "product_build",
    status: "active",
    progress_pct: 0,
    description: "Live verification fixture for repo-backed discovery handoff reconciliation",
    intake: {
      stage: "planning",
      shape: "web-app",
      projectOrigin: "new",
      attachmentKickoffState: {
        status: "finalized",
        label: "Kickoff ready",
        detail: "Fixture attachment intake finalized.",
        progressPct: 100,
        active: false,
        updatedAt: new Date().toISOString(),
      },
    },
    intake_summary: "Fixture for live discovery handoff verification",
    links: { github: "https://github.com/projectmrwaffles/live-discovery-handoff-fixture" },
    github_repo_binding: {
      url: "https://github.com/projectmrwaffles/live-discovery-handoff-fixture",
      repo: "live-discovery-handoff-fixture",
      owner: "projectmrwaffles",
      fullName: "projectmrwaffles/live-discovery-handoff-fixture",
      provider: "github",
      source: "fixture",
      linkedAt: new Date().toISOString(),
      provisioning: { status: "ready", reason: "fixture" },
      projectLinkKey: "github",
    },
  }).select("id").single();
  assert.equal(projectInsert.error, null, projectInsert.error?.message || "Failed to insert project fixture");
  created.projectId = projectInsert.data.id;

  const day = new Date().toISOString().slice(0, 10);
  const sprintInsert = await db.from("sprints").insert([
    {
      project_id: created.projectId,
      name: "Phase 1 · Discover",
      goal: "Finish discovery",
      status: "active",
      start_date: day,
      end_date: day,
      phase_key: "discover",
      phase_order: 1,
      auto_generated: true,
      approval_gate_required: false,
      approval_gate_status: "not_requested",
      delivery_review_required: false,
      delivery_review_status: null,
    },
    {
      project_id: created.projectId,
      name: "Phase 2 · Build",
      goal: "Start build",
      status: "draft",
      start_date: day,
      end_date: day,
      phase_key: "build",
      phase_order: 2,
      auto_generated: true,
      approval_gate_required: false,
      approval_gate_status: "not_requested",
      delivery_review_required: false,
      delivery_review_status: null,
    },
  ]).select("id, phase_key");
  assert.equal(sprintInsert.error, null, sprintInsert.error?.message || "Failed to insert sprint fixture");
  created.sprintIds = sprintInsert.data.map((row) => row.id);
  const discoverSprint = sprintInsert.data.find((row) => row.phase_key === "discover");
  const buildSprint = sprintInsert.data.find((row) => row.phase_key === "build");
  assert.ok(discoverSprint && buildSprint, "Expected discover and build sprints");

  const taskInsert = await db.from("sprint_items").insert([
    {
      project_id: created.projectId,
      sprint_id: discoverSprint.id,
      title: "Scope from attachments",
      description: "Repo-backed discovery artifacts are complete.",
      status: "done",
      position: 1,
      task_type: "discovery_plan",
      review_required: false,
      assignee_agent_id: discoveryAgent.id,
      task_metadata: { phase_key: "discover", auto_generated: true },
    },
    {
      project_id: created.projectId,
      sprint_id: buildSprint.id,
      title: "Frontend implementation",
      description: "Should dispatch after discovery handoff.",
      status: "todo",
      position: 2,
      task_type: "build_implementation",
      review_required: true,
      assignee_agent_id: buildAgent.id,
      task_metadata: { phase_key: "build", auto_generated: true },
    },
  ]).select("id, sprint_id, assignee_agent_id");
  assert.equal(taskInsert.error, null, taskInsert.error?.message || "Failed to insert task fixture");
  created.taskIds = taskInsert.data.map((row) => row.id);
  const discoveryTask = taskInsert.data.find((row) => row.sprint_id === discoverSprint.id);
  const buildTask = taskInsert.data.find((row) => row.sprint_id === buildSprint.id);
  assert.ok(discoveryTask && buildTask, "Expected discovery and build tasks");

  const result = await maybeAdvanceProjectAfterTaskDone(db, {
    projectId: created.projectId,
    completedTaskId: discoveryTask.id,
  });

  const { data: sprintsAfter, error: sprintsAfterError } = await db
    .from("sprints")
    .select("id, name, status, phase_key")
    .eq("project_id", created.projectId)
    .order("phase_order", { ascending: true });
  assert.equal(sprintsAfterError, null, sprintsAfterError?.message || "Failed to reload sprints");

  const { data: jobsAfter, error: jobsAfterError } = await db
    .from("jobs")
    .select("id, owner_agent_id, status, summary")
    .eq("project_id", created.projectId)
    .order("created_at", { ascending: true });
  assert.equal(jobsAfterError, null, jobsAfterError?.message || "Failed to reload jobs");

  const { data: eventsAfter, error: eventsAfterError } = await db
    .from("agent_events")
    .select("agent_id, event_type, payload, created_at")
    .eq("project_id", created.projectId)
    .order("created_at", { ascending: true });
  assert.equal(eventsAfterError, null, eventsAfterError?.message || "Failed to reload agent events");

  const discoverAfter = sprintsAfter.find((row) => row.phase_key === "discover");
  const buildAfter = sprintsAfter.find((row) => row.phase_key === "build");
  const buildJob = jobsAfter.find((row) => row.summary === `task:${buildTask.id}`);
  const phaseAdvancedEvent = eventsAfter.find((row) => row.event_type === "project_phase_advanced");

  assert.equal(result.advanced, true, `Expected advancement, received ${JSON.stringify(result)}`);
  assert.equal(discoverAfter?.status, "completed", "Discovery sprint should be completed");
  assert.equal(buildAfter?.status, "active", "Build sprint should be active after discovery handoff");
  assert.deepEqual(result.dispatchedTaskIds, [buildTask.id], "Build task should dispatch immediately after discovery handoff");
  assert.ok(buildJob?.id, "Expected a build job to be created for the next sprint task");
  assert.equal(buildJob?.owner_agent_id, buildAgent.id, "Build job should belong to the build assignee");
  assert.ok(phaseAdvancedEvent, "Expected a project_phase_advanced event for downstream handoff consumers");
  assert.equal(phaseAdvancedEvent?.agent_id, discoveryAgent.id, "Phase handoff event should be attributed to the completed discovery owner");
  assert.equal(phaseAdvancedEvent?.payload?.completed_task_id, discoveryTask.id, "Phase handoff event should reference the completed discovery task");

  console.log("verify-live-discovery-handoff-reconcile: ok", JSON.stringify({
    projectId: created.projectId,
    result,
    sprintsAfter,
    buildJob,
    phaseAdvancedEvent,
  }, null, 2));
} finally {
  await cleanup();
}

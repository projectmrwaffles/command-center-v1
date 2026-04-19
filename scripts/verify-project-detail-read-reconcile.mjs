import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { deriveProjectDetailHeaderState, shouldShowAttachmentKickoffBanner } from "../src/lib/project-detail-state.ts";

const baseUrl = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000";
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL is required");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const projectName = `Verify Detail Reconcile ${Date.now()}`;

async function getActiveFixtureAgentId() {
  const { data, error } = await db
    .from("agents")
    .select("id, name")
    .not("name", "like", "_archived_%")
    .limit(1);
  assert.equal(error, null, error?.message || "Failed to load fixture agent");
  assert.ok(data?.[0]?.id, "Expected at least one available agent fixture");
  return data[0].id;
}

const createdIds = {
  projectId: null,
  sprintIds: [],
  taskIds: [],
};

async function cleanup() {
  const projectId = createdIds.projectId;
  if (!projectId) return;

  await db.from("agent_events").delete().eq("project_id", projectId);
  await db.from("jobs").delete().eq("project_id", projectId);
  await db.from("approvals").delete().eq("project_id", projectId);
  await db.from("sprint_items").delete().eq("project_id", projectId);
  await db.from("sprints").delete().eq("project_id", projectId);
  await db.from("projects").delete().eq("id", projectId);
}

try {
  const fixtureAgentId = await getActiveFixtureAgentId();

  const intake = {
    summary: "Verification fixture for GET detail reconciliation",
    attachmentKickoffState: {
      status: "finalized",
      label: "Kickoff ready",
      detail: "Attachment intake is complete and the project has moved into normal kickoff/workflow state.",
      progressPct: 100,
      active: false,
      fileCount: 1,
      updatedAt: new Date().toISOString(),
    },
  };

  const projectInsert = await db.from("projects").insert({
    name: projectName,
    type: "product_build",
    team_id: null,
    description: "Temporary verification fixture",
    intake,
    intake_summary: intake.summary,
    status: "active",
    progress_pct: 0,
    links: { github: "https://github.com/vercel/next.js" },
    github_repo_binding: null,
  }).select("id, name").single();
  assert.equal(projectInsert.error, null, projectInsert.error?.message || "Failed to insert project fixture");
  createdIds.projectId = projectInsert.data.id;

  const today = new Date().toISOString().slice(0, 10);
  const sprintInsert = await db.from("sprints").insert([
    {
      project_id: createdIds.projectId,
      name: "Kickoff",
      goal: "Complete kickoff",
      start_date: today,
      end_date: today,
      status: "active",
      phase_key: "discover",
      phase_order: 1,
      auto_generated: true,
      approval_gate_required: false,
      approval_gate_status: "not_requested",
      delivery_review_required: false,
      delivery_review_status: "not_requested",
    },
    {
      project_id: createdIds.projectId,
      name: "Acceptance review",
      goal: "Ready for follow-on work",
      start_date: today,
      end_date: today,
      status: "draft",
      phase_key: "build",
      phase_order: 2,
      auto_generated: true,
      approval_gate_required: false,
      approval_gate_status: "not_requested",
      delivery_review_required: false,
      delivery_review_status: "not_requested",
    },
  ]).select("id, name, status, phase_order");
  assert.equal(sprintInsert.error, null, sprintInsert.error?.message || "Failed to insert sprint fixtures");
  const kickoffSprint = sprintInsert.data.find((row) => row.phase_order === 1);
  const reviewSprint = sprintInsert.data.find((row) => row.phase_order === 2);
  assert.ok(kickoffSprint && reviewSprint, "Expected both sprint fixtures");
  createdIds.sprintIds = sprintInsert.data.map((row) => row.id);

  const taskInsert = await db.from("sprint_items").insert([
    {
      project_id: createdIds.projectId,
      sprint_id: kickoffSprint.id,
      title: "Finalize kickoff scope",
      description: "done task",
      status: "done",
      position: 1,
      review_required: false,
      task_type: "discovery_plan",
      assignee_agent_id: fixtureAgentId,
    },
    {
      project_id: createdIds.projectId,
      sprint_id: reviewSprint.id,
      title: "Review seeded plan",
      description: "later phase task",
      status: "todo",
      position: 2,
      review_required: false,
      task_type: "build_implementation",
      assignee_agent_id: fixtureAgentId,
    },
  ]).select("id, sprint_id, title, status");
  assert.equal(taskInsert.error, null, taskInsert.error?.message || "Failed to insert task fixtures");
  createdIds.taskIds = taskInsert.data.map((row) => row.id);

  const headers = { Accept: "application/json" };
  if (process.env.AGENT_AUTH_TOKEN) headers.Authorization = `Bearer ${process.env.AGENT_AUTH_TOKEN}`;
  const apiResponse = await fetch(`${baseUrl}/api/projects/${createdIds.projectId}`, { headers });
  assert.equal(apiResponse.status, 200, `Expected 200 from project detail GET, received ${apiResponse.status}`);
  const payload = await apiResponse.json();

  const kickoffAfter = payload.sprints.find((sprint) => sprint.id === kickoffSprint.id);
  const reviewAfter = payload.sprints.find((sprint) => sprint.id === reviewSprint.id);
  assert.equal(kickoffAfter?.status, "completed", "GET detail should self-heal the completed kickoff sprint");
  assert.equal(reviewAfter?.status, "active", "GET detail should activate the next sprint after reconciliation");
  assert.ok(
    !payload.executionVisibility?.queuedReasons?.some((reason) => reason.taskId === taskInsert.data[1].id && reason.status === "waiting_for_kickoff_completion"),
    "Later-phase task should no longer stay blocked on stale kickoff completion after GET reconciliation",
  );

  const finalizedAttachmentState = payload.project?.intake?.attachmentKickoffState;
  assert.equal(shouldShowAttachmentKickoffBanner(finalizedAttachmentState), false, "Finalized attachment intake state should not render as the main header banner");
  const headerState = deriveProjectDetailHeaderState({
    projectProgressPct: payload.project?.progress_pct,
    truth: payload.truth,
    attachmentKickoffState: finalizedAttachmentState,
  });
  assert.notEqual(headerState.key, "attachment_processing", "Header should fall back to normal workflow truth once attachment intake is finalized");
  assert.notEqual(headerState.key, "attachment_failed", "Finalized attachment state should not be treated like an attachment issue");


  console.log("verify-project-detail-read-reconcile: ok", JSON.stringify({
    projectId: createdIds.projectId,
    projectName,
    kickoffStatus: kickoffAfter?.status,
    nextSprintStatus: reviewAfter?.status,
    queuedReasons: payload.executionVisibility?.queuedReasons || [],
  }, null, 2));
} finally {
  await cleanup();
}

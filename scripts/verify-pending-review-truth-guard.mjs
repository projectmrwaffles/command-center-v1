import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { deriveProjectDetailHeaderState, deriveMilestoneDisplayState } from "../src/lib/project-detail-state.ts";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
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

const createdIds = { projectId: null };

async function getActiveFixtureAgentId() {
  const { data, error } = await db.from("agents").select("id").not("name", "like", "_archived_%").limit(1);
  assert.equal(error, null, error?.message || "Failed to load fixture agent");
  assert.ok(data?.[0]?.id, "Expected at least one available agent fixture");
  return data[0].id;
}

async function cleanup() {
  if (!createdIds.projectId) return;
  const projectId = createdIds.projectId;
  await db.from("agent_events").delete().eq("project_id", projectId);
  await db.from("review_feedback_items").delete().eq("project_id", projectId);
  await db.from("review_proof_items").delete().eq("project_id", projectId);
  await db.from("review_proof_bundles").delete().eq("project_id", projectId);
  await db.from("review_submissions").delete().eq("project_id", projectId);
  await db.from("approvals").delete().eq("project_id", projectId);
  await db.from("jobs").delete().eq("project_id", projectId);
  await db.from("sprint_items").delete().eq("project_id", projectId);
  await db.from("sprints").delete().eq("project_id", projectId);
  await db.from("projects").delete().eq("id", projectId);
}

try {
  const fixtureAgentId = await getActiveFixtureAgentId();
  const today = new Date().toISOString().slice(0, 10);

  const projectInsert = await db.from("projects").insert({
    name: `Verify pending review truth guard ${Date.now()}`,
    type: "product_build",
    status: "active",
    progress_pct: 0,
    intake: { shape: "web-app", capabilities: ["frontend"] },
    links: { github: "https://github.com/vercel/next.js" },
  }).select("id").single();
  assert.equal(projectInsert.error, null, projectInsert.error?.message || "Failed to create project fixture");
  createdIds.projectId = projectInsert.data.id;

  const sprintInsert = await db.from("sprints").insert({
    project_id: createdIds.projectId,
    name: "Build",
    goal: "Ship build",
    start_date: today,
    end_date: today,
    status: "active",
    phase_key: "build",
    phase_order: 1,
    auto_generated: true,
    approval_gate_required: false,
    approval_gate_status: "not_requested",
    delivery_review_required: true,
    delivery_review_status: "pending",
  }).select("id").single();
  assert.equal(sprintInsert.error, null, sprintInsert.error?.message || "Failed to create sprint fixture");

  const taskInsert = await db.from("sprint_items").insert([
    {
      project_id: createdIds.projectId,
      sprint_id: sprintInsert.data.id,
      title: "Implement feature",
      status: "done",
      position: 1,
      review_required: false,
      task_type: "build_implementation",
      assignee_agent_id: fixtureAgentId,
    },
    {
      project_id: createdIds.projectId,
      sprint_id: sprintInsert.data.id,
      title: "QA validation",
      status: "todo",
      position: 2,
      review_required: false,
      task_type: "qa_validation",
      assignee_agent_id: fixtureAgentId,
    },
  ]).select("id");
  assert.equal(taskInsert.error, null, taskInsert.error?.message || "Failed to create task fixtures");

  const headers = { Accept: "application/json" };
  if (process.env.AGENT_AUTH_TOKEN) headers.Authorization = `Bearer ${process.env.AGENT_AUTH_TOKEN}`;
  const response = await fetch(`${baseUrl}/api/projects/${createdIds.projectId}`, { headers });
  const responseText = await response.text();
  assert.equal(response.status, 200, `Expected 200 from project detail GET, received ${response.status}: ${responseText}`);
  const payload = JSON.parse(responseText);

  const buildMilestone = payload.milestones.find((sprint) => sprint.id === sprintInsert.data.id);
  assert.ok(buildMilestone, "Expected build milestone in payload");
  assert.equal(buildMilestone.deliveryReviewStatus, "pending", "Fixture should preserve raw pending delivery review status");
  assert.equal(buildMilestone.reviewRequest, null, "Fixture should not materialize a review request");
  assert.equal(buildMilestone.reviewSummary?.latestSubmissionId ?? null, null, "Fixture should not materialize a review submission");

  const milestoneState = deriveMilestoneDisplayState(buildMilestone);
  assert.equal(milestoneState.checkpointState.key, "ready_for_review", "First-pass QC should become review-ready as soon as implementation is complete");
  assert.equal(milestoneState.stageState.key, "qa_ready", "Milestone should show QA ready instead of waiting for a review packet");

  const headerState = deriveProjectDetailHeaderState({
    projectProgressPct: payload.project?.progress_pct,
    truth: payload.truth,
    attachmentKickoffState: payload.project?.intake?.attachmentKickoffState,
  });
  assert.equal(payload.truth?.execution?.key, "validation_ready", "Project truth should expose first-pass QC as the next runnable checkpoint");
  assert.ok(/qa ready/i.test(String(payload.truth?.headline || "")), "Truth headline should announce QA readiness once implementation is complete");
  assert.ok(/qa ready/i.test(String(headerState.headline || "")), "Header should stay aligned with first-pass QC readiness");

  console.log("verify-pending-review-truth-guard: ok", JSON.stringify({
    projectId: createdIds.projectId,
    truthExecution: payload.truth?.execution,
    truthHeadline: payload.truth?.headline,
    headerState,
    milestoneCheckpoint: milestoneState.checkpointState,
    milestoneStage: milestoneState.stageState,
  }, null, 2));
} finally {
  await cleanup();
}

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { deriveMilestoneDisplayState, deriveMilestoneReviewCardCopy } from "../src/lib/project-detail-state.ts";

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
  const { data: sprintRows } = await db.from("sprints").select("id").eq("project_id", projectId);
  const sprintIds = (sprintRows || []).map((row) => row.id);
  let submissionIds = [];
  let bundleIds = [];

  if (sprintIds.length > 0) {
    const { data: submissionRows } = await db.from("milestone_submissions").select("id").in("sprint_id", sprintIds);
    submissionIds = (submissionRows || []).map((row) => row.id);
    if (submissionIds.length > 0) {
      const { data: proofBundleRows } = await db.from("proof_bundles").select("id").in("submission_id", submissionIds);
      bundleIds = (proofBundleRows || []).map((row) => row.id);
    }
  }

  await db.from("agent_events").delete().eq("project_id", projectId);
  if (submissionIds.length > 0) await db.from("submission_feedback_items").delete().in("submission_id", submissionIds);
  if (bundleIds.length > 0) await db.from("proof_items").delete().in("proof_bundle_id", bundleIds);
  if (submissionIds.length > 0) await db.from("proof_bundles").delete().in("submission_id", submissionIds);
  if (submissionIds.length > 0) await db.from("milestone_submissions").delete().in("sprint_id", sprintIds);
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
    name: `Verify review card auto submission ${Date.now()}`,
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
    delivery_review_status: "not_requested",
  }).select("id").single();
  assert.equal(sprintInsert.error, null, sprintInsert.error?.message || "Failed to create sprint fixture");

  const taskInsert = await db.from("sprint_items").insert({
    project_id: createdIds.projectId,
    sprint_id: sprintInsert.data.id,
    title: "Implement feature",
    status: "done",
    position: 1,
    review_required: false,
    task_type: "build_implementation",
    assignee_agent_id: fixtureAgentId,
  }).select("id").single();
  assert.equal(taskInsert.error, null, taskInsert.error?.message || "Failed to create implementation task");

  const headers = { Accept: "application/json" };
  if (process.env.AGENT_AUTH_TOKEN) headers.Authorization = `Bearer ${process.env.AGENT_AUTH_TOKEN}`;
  const response = await fetch(`${baseUrl}/api/projects/${createdIds.projectId}`, { headers });
  const responseText = await response.text();
  assert.equal(response.status, 200, `Expected 200 from project detail GET, received ${response.status}: ${responseText}`);
  const payload = JSON.parse(responseText);

  const buildMilestone = payload.milestones.find((sprint) => sprint.id === sprintInsert.data.id);
  assert.ok(buildMilestone, "Expected build milestone in payload");
  assert.equal(buildMilestone.deliveryReviewStatus, "pending", "GET reconcile should create the pending first-pass QC checkpoint");
  assert.equal(buildMilestone.reviewSummary?.proofCompletenessStatus, "incomplete", "Fixture should reproduce the auto-generated incomplete packet path");

  const milestoneState = deriveMilestoneDisplayState(buildMilestone);
  const reviewCardCopy = deriveMilestoneReviewCardCopy(buildMilestone);
  assert.equal(milestoneState.checkpointState.key, "ready_for_review", "Incomplete auto-generated first-pass packets should still surface as review-ready");
  assert.equal(milestoneState.stageState.key, "qa_ready", "Review card should render QA ready instead of QA queued for first-pass QC");
  assert.ok(!/qa queued/i.test(reviewCardCopy.milestoneDisplayState.stageState.label), "Review card badge should no longer show QA queued");
  assert.ok(!/held behind earlier sequencing work/i.test(reviewCardCopy.summaryCopy), "Review card summary should no longer mention sequencing hold copy");
  assert.ok(/next runnable checkpoint/i.test(reviewCardCopy.summaryCopy), "Review card summary should use the QA-ready guidance copy");
  assert.ok(/First-pass QC is ready to run now/i.test(reviewCardCopy.helperCopy), "Review card helper copy should align with the QA-ready badge and summary");
  assert.ok(!/waiting for first-pass QC/i.test(reviewCardCopy.helperCopy), "Review card helper copy should no longer use QA queued guidance");

  console.log("verify-review-card-first-pass-auto-submission: ok", JSON.stringify({
    projectId: createdIds.projectId,
    milestoneCheckpoint: milestoneState.checkpointState,
    milestoneStage: reviewCardCopy.milestoneDisplayState.stageState,
    reviewSummaryStatus: buildMilestone.reviewSummary?.proofCompletenessStatus,
    summaryCopy: reviewCardCopy.summaryCopy,
    helperCopy: reviewCardCopy.helperCopy,
  }, null, 2));
} finally {
  await cleanup();
}

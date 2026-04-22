import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { deriveMilestoneDisplayState, deriveProjectDetailHeaderState } from "../src/lib/project-detail-state.ts";
import { deriveFirstPassQcState } from "../src/lib/review-checkpoint-state.ts";

const baseUrl = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000";
const repoRoot = process.cwd();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
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

const ids = { projectId: null, sprintId: null, jobId: null, approvalId: null, submissionId: null, bundleId: null };

async function getFixtureAgentId() {
  const idleQuery = await db
    .from("agents")
    .select("id")
    .not("name", "like", "_archived_%")
    .eq("status", "idle")
    .is("current_job_id", null)
    .limit(1);
  assert.equal(idleQuery.error, null, idleQuery.error?.message || "Failed to load idle fixture agent");
  if (idleQuery.data?.[0]?.id) return idleQuery.data[0].id;

  const fallbackQuery = await db.from("agents").select("id").not("name", "like", "_archived_%").limit(1);
  assert.equal(fallbackQuery.error, null, fallbackQuery.error?.message || "Failed to load fixture agent");
  assert.ok(fallbackQuery.data?.[0]?.id, "Expected at least one available agent fixture");
  return fallbackQuery.data[0].id;
}

async function fetchDetail(projectId) {
  const headers = { Accept: "application/json" };
  if (process.env.AGENT_AUTH_TOKEN) headers.Authorization = `Bearer ${process.env.AGENT_AUTH_TOKEN}`;
  const res = await fetch(`${baseUrl}/api/projects/${projectId}`, { headers });
  const text = await res.text();
  assert.equal(res.status, 200, `Expected 200 from project detail GET, got ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function cleanup() {
  if (!ids.projectId) return;
  const projectId = ids.projectId;
  if (ids.approvalId) await db.from("approvals").delete().eq("id", ids.approvalId);
  if (ids.jobId) await db.from("jobs").delete().eq("id", ids.jobId);
  if (ids.bundleId) await db.from("proof_items").delete().eq("proof_bundle_id", ids.bundleId);
  if (ids.bundleId) await db.from("proof_bundles").delete().eq("id", ids.bundleId);
  if (ids.submissionId) await db.from("milestone_submissions").delete().eq("id", ids.submissionId);
  await db.from("agent_events").delete().eq("project_id", projectId);
  await db.from("sprint_items").delete().eq("project_id", projectId);
  await db.from("sprints").delete().eq("project_id", projectId);
  await db.from("projects").delete().eq("id", projectId);
}

try {
  const agentId = await getFixtureAgentId();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const projectInsert = await db.from("projects").insert({
    name: `Verify first pass QC unification ${Date.now()}`,
    type: "product_build",
    status: "active",
    progress_pct: 0,
    intake: { shape: "web-app", capabilities: ["frontend"] },
    links: { github: "https://github.com/vercel/next.js" },
  }).select("id").single();
  assert.equal(projectInsert.error, null, projectInsert.error?.message || "Failed to create project");
  ids.projectId = projectInsert.data.id;

  const sprintInsert = await db.from("sprints").insert({
    project_id: ids.projectId,
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
    checkpoint_type: "delivery_review",
  }).select("id").single();
  assert.equal(sprintInsert.error, null, sprintInsert.error?.message || "Failed to create sprint");
  ids.sprintId = sprintInsert.data.id;

  const taskInsert = await db.from("sprint_items").insert([
    { project_id: ids.projectId, sprint_id: ids.sprintId, title: "Implement feature", status: "done", position: 1, review_required: false, task_type: "build_implementation", assignee_agent_id: agentId },
    { project_id: ids.projectId, sprint_id: ids.sprintId, title: "QA validation", status: "todo", position: 2, review_required: false, task_type: "qa_validation", assignee_agent_id: agentId },
  ]).select("id");
  assert.equal(taskInsert.error, null, taskInsert.error?.message || "Failed to create tasks");

  const submissionInsert = await db.from("milestone_submissions").insert({
    sprint_id: ids.sprintId,
    revision_number: 1,
    status: "submitted",
    checkpoint_type: "delivery_review",
    summary: "Ready for review",
    what_changed: "Completed: Implement feature",
    risks: null,
    submitted_at: now,
  }).select("id").single();
  assert.equal(submissionInsert.error, null, submissionInsert.error?.message || "Failed to create submission");
  ids.submissionId = submissionInsert.data.id;

  const bundleInsert = await db.from("proof_bundles").insert({
    submission_id: ids.submissionId,
    title: "Proof bundle",
    completeness_status: "ready",
  }).select("id").single();
  assert.equal(bundleInsert.error, null, bundleInsert.error?.message || "Failed to create proof bundle");
  ids.bundleId = bundleInsert.data.id;

  const proofInsert = await db.from("proof_items").insert({
    proof_bundle_id: ids.bundleId,
    kind: "screenshot",
    label: "Running app screenshot",
    sort_order: 0,
  }).select("id").single();
  assert.equal(proofInsert.error, null, proofInsert.error?.message || "Failed to create proof item");

  let payload = await fetchDetail(ids.projectId);
  let milestone = payload.milestones.find((item) => item.id === ids.sprintId);
  let qcState = deriveFirstPassQcState({ approvalGateStatus: milestone.deliveryReviewStatus, reviewSummary: milestone.reviewSummary, reviewRequest: milestone.reviewRequest, preBuildCheckpoint: milestone.preBuildCheckpoint });
  let milestoneState = deriveMilestoneDisplayState(milestone);
  let headerState = deriveProjectDetailHeaderState({ projectProgressPct: payload.project?.progress_pct, truth: payload.truth, attachmentKickoffState: payload.project?.intake?.attachmentKickoffState });
  assert.equal(qcState.key, "ready_for_review");
  assert.equal(milestoneState.stageState.key, "qa_ready");
  assert.equal(headerState.key, "validation_ready");

  const jobInsert = await db.from("jobs").insert({ project_id: ids.projectId, owner_agent_id: agentId, title: "Delivery review", status: "queued", summary: "Delivery review" }).select("id").single();
  assert.equal(jobInsert.error, null, jobInsert.error?.message || "Failed to create job");
  ids.jobId = jobInsert.data.id;
  const approvalInsert = await db.from("approvals").insert({ project_id: ids.projectId, sprint_id: ids.sprintId, job_id: ids.jobId, agent_id: agentId, status: "pending", summary: "Delivery review pending", created_at: now }).select("id").single();
  assert.equal(approvalInsert.error, null, approvalInsert.error?.message || "Failed to create approval");
  ids.approvalId = approvalInsert.data.id;

  payload = await fetchDetail(ids.projectId);
  milestone = payload.milestones.find((item) => item.id === ids.sprintId);
  qcState = deriveFirstPassQcState({ approvalGateStatus: milestone.deliveryReviewStatus, reviewSummary: milestone.reviewSummary, reviewRequest: milestone.reviewRequest, preBuildCheckpoint: milestone.preBuildCheckpoint });
  milestoneState = deriveMilestoneDisplayState(milestone);
  assert.equal(qcState.key, "approval_requested");
  assert.equal(milestoneState.stageState.key, "delivery_review_active");
  assert.equal(milestoneState.stageState.label, "Review requested");
  assert.equal(payload.truth.execution.key, "acceptance_pending");

  const submissionUnderReview = await db.from("milestone_submissions").update({ status: "under_review" }).eq("id", ids.submissionId);
  assert.equal(submissionUnderReview.error, null, submissionUnderReview.error?.message || "Failed to mark submission under review");

  payload = await fetchDetail(ids.projectId);
  milestone = payload.milestones.find((item) => item.id === ids.sprintId);
  qcState = deriveFirstPassQcState({ approvalGateStatus: milestone.deliveryReviewStatus, reviewSummary: milestone.reviewSummary, reviewRequest: milestone.reviewRequest, preBuildCheckpoint: milestone.preBuildCheckpoint });
  milestoneState = deriveMilestoneDisplayState(milestone);
  assert.equal(qcState.key, "in_review");
  assert.equal(milestoneState.stageState.key, "delivery_review_active");
  assert.equal(milestoneState.stageState.label, "In review");
  assert.equal(payload.truth.execution.key, "acceptance_pending");

  console.log("verify-first-pass-qc-unification: ok", JSON.stringify({
    projectId: ids.projectId,
    readyForReview: "qa_ready",
    approvalRequested: "delivery_review_active",
    inReview: "delivery_review_active",
    truthExecution: payload.truth.execution,
    milestoneStage: milestoneState.stageState,
    qcState,
  }, null, 2));
} finally {
  await cleanup();
}

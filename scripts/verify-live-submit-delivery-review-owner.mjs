import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const repoRoot = process.cwd();
const baseUrl = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000";

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

assert.ok(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL is required");
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY is required");
assert.ok(process.env.AGENT_AUTH_TOKEN, "AGENT_AUTH_TOKEN is required");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const created = { projectId: null, sprintId: null };

async function cleanup() {
  if (!created.projectId) return;
  const projectId = created.projectId;
  await db.from("agent_events").delete().eq("project_id", projectId);
  await db.from("approvals").delete().eq("project_id", projectId);
  await db.from("jobs").delete().eq("project_id", projectId);
  const sprintRows = (await db.from("sprints").select("id").eq("project_id", projectId)).data || [];
  const sprintIds = sprintRows.map((row) => row.id);
  const submissionRows = sprintIds.length ? ((await db.from("milestone_submissions").select("id").in("sprint_id", sprintIds)).data || []) : [];
  const submissionIds = submissionRows.map((row) => row.id);
  const bundleRows = submissionIds.length ? ((await db.from("proof_bundles").select("id").in("submission_id", submissionIds)).data || []) : [];
  const bundleIds = bundleRows.map((row) => row.id);
  if (bundleIds.length) await db.from("proof_items").delete().in("proof_bundle_id", bundleIds);
  if (submissionIds.length) await db.from("proof_bundles").delete().in("submission_id", submissionIds);
  if (submissionIds.length) await db.from("milestone_submissions").delete().in("id", submissionIds);
  await db.from("sprint_items").delete().eq("project_id", projectId);
  await db.from("sprints").delete().eq("project_id", projectId);
  await db.from("projects").delete().eq("id", projectId);
}

try {
  const { data: teamLead } = await db.from("team_members").select("team_id, agent_id, role").eq("role", "lead").limit(1).maybeSingle();
  assert.ok(teamLead?.team_id && teamLead?.agent_id, "Need a team lead fixture");

  const today = new Date().toISOString().slice(0, 10);
  const projectRes = await db.from("projects").insert({
    name: `Live submit delivery review owner ${Date.now()}`,
    type: "product_build",
    status: "active",
    progress_pct: 55,
    intake: { shape: "web-app", capabilities: ["frontend"] },
    links: { github: "https://github.com/vercel/next.js", preview: "https://nextjs.org" },
  }).select("id").single();
  assert.equal(projectRes.error, null, projectRes.error?.message || "project insert failed");
  created.projectId = projectRes.data.id;

  const sprintRes = await db.from("sprints").insert({
    project_id: created.projectId,
    name: "Build",
    goal: "Ship first pass",
    start_date: today,
    end_date: today,
    status: "completed",
    phase_key: "build",
    phase_order: 1,
    auto_generated: true,
    approval_gate_required: false,
    approval_gate_status: "not_requested",
    delivery_review_required: true,
    delivery_review_status: "not_requested",
    checkpoint_type: "delivery_review",
  }).select("id").single();
  assert.equal(sprintRes.error, null, sprintRes.error?.message || "sprint insert failed");
  created.sprintId = sprintRes.data.id;

  const tasksRes = await db.from("sprint_items").insert([
    { project_id: created.projectId, sprint_id: created.sprintId, title: "Implement feature", status: "done", position: 1, review_required: false, review_status: "not_requested", task_type: "build_implementation", owner_team_id: teamLead.team_id, assignee_agent_id: null },
    { project_id: created.projectId, sprint_id: created.sprintId, title: "QA validation", status: "done", position: 2, review_required: true, review_status: "not_requested", task_type: "qa_validation", owner_team_id: teamLead.team_id, assignee_agent_id: null },
  ]);
  assert.equal(tasksRes.error, null, tasksRes.error?.message || "task insert failed");

  const response = await fetch(`${baseUrl}/api/projects/${created.projectId}/milestones/${created.sprintId}/submit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.AGENT_AUTH_TOKEN}`,
    },
    body: JSON.stringify({
      summary: "Ready for first-pass QC",
      whatChanged: "Completed: Implement feature",
      proofBundle: {
        title: "First-pass proof bundle",
        summary: "Ready for first-pass QC",
        items: [
          { kind: "screenshot", label: "Running app screenshot", storagePath: "/tmp/live-submit-delivery-review-owner.png" },
          { kind: "staging_url", label: "Preview", url: "https://nextjs.org" },
          { kind: "commit", label: "Commit", url: "https://github.com/vercel/next.js/commit/0" },
        ],
      },
    }),
  });
  const text = await response.text();
  assert.equal(response.status, 201, `submit route failed: ${response.status} ${text}`);
  const payload = JSON.parse(text);

  const { data: approvals } = await db.from("approvals").select("id, job_id, status, agent_id").eq("project_id", created.projectId).eq("sprint_id", created.sprintId);
  const pendingApproval = approvals?.find((row) => row.status === "pending") || null;
  assert.ok(pendingApproval?.id, "expected pending approval after submit route");
  assert.equal(pendingApproval.agent_id, teamLead.agent_id, "approval should resolve team lead as owner");

  const { data: job } = await db.from("jobs").select("id, owner_agent_id, status, title").eq("id", pendingApproval.job_id).maybeSingle();
  assert.ok(job?.id, "expected linked review job");
  assert.equal(job.owner_agent_id, teamLead.agent_id, "review job owner_agent_id should not be null and should use resolved owner");

  const { data: sprint } = await db.from("sprints").select("delivery_review_status").eq("id", created.sprintId).maybeSingle();
  assert.equal(sprint?.delivery_review_status, "pending", "delivery review status should stay pending");

  console.log(JSON.stringify({
    projectId: created.projectId,
    sprintId: created.sprintId,
    reviewRequestId: payload.reviewRequest?.approval_id || payload.reviewRequest?.approvalId || null,
    approvalId: pendingApproval.id,
    jobId: job.id,
    ownerAgentId: job.owner_agent_id,
    deliveryReviewStatus: sprint?.delivery_review_status || null,
  }, null, 2));
} finally {
  if (process.env.KEEP_FIXTURE !== "1") await cleanup();
}

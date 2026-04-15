import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { seedProjectKickoffPlan } from "../src/lib/project-kickoff.ts";
import { syncProjectPreBuildCheckpoint } from "../src/lib/pre-build-checkpoint.ts";
import { dispatchEligibleProjectTasks } from "../src/lib/project-execution.ts";
import { deriveReviewCheckpointState } from "../src/lib/review-checkpoint-state.ts";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

let idCounter = 1;
function makeId(prefix) {
  const value = `${prefix}-${idCounter}`;
  idCounter += 1;
  return value;
}

function createDb(tables) {
  return {
    tables,
    from(table) {
      if (!this.tables[table]) this.tables[table] = [];
      return createQuery(this.tables, table);
    },
    channel() {
      return {
        async send() {
          return { error: null };
        },
      };
    },
  };
}

function createQuery(tables, table) {
  const state = { filters: [], orderBy: [], limitCount: null, pendingUpdate: null, pendingInsert: null, pendingDelete: false, selectClause: null };
  const api = {
    select(selectClause) {
      state.selectClause = selectClause;
      return api;
    },
    eq(column, value) {
      state.filters.push((row) => row?.[column] === value);
      return api;
    },
    in(column, values) {
      state.filters.push((row) => values.includes(row?.[column]));
      return api;
    },
    not(column, op, value) {
      if (op === "is" && value === null) state.filters.push((row) => row?.[column] !== null && row?.[column] !== undefined);
      if (op === "like" && typeof value === "string") {
        const regex = new RegExp(`^${value.replace(/[%*]/g, ".*")}$`);
        state.filters.push((row) => !regex.test(String(row?.[column] ?? "")));
      }
      return api;
    },
    ilike(column, value) {
      const needle = String(value || "").toLowerCase();
      state.filters.push((row) => String(row?.[column] || "").toLowerCase().includes(needle));
      return api;
    },
    order(column, { ascending = true } = {}) {
      state.orderBy.push({ column, ascending });
      return api;
    },
    limit(count) {
      state.limitCount = count;
      return api;
    },
    update(payload) {
      state.pendingUpdate = payload;
      return api;
    },
    insert(payload) {
      state.pendingInsert = payload;
      return api;
    },
    delete() {
      state.pendingDelete = true;
      return api;
    },
    async maybeSingle() {
      const rows = apply();
      return { data: rows[0] ?? null, error: null };
    },
    async single() {
      const rows = apply();
      return { data: rows[0] ?? null, error: rows[0] ? null : { message: `No row in ${table}` } };
    },
    then(resolve, reject) {
      return Promise.resolve({ data: apply(), error: null }).then(resolve, reject);
    },
  };

  function applyFilters(rows) {
    let next = rows.filter((row) => state.filters.every((filter) => filter(row)));
    for (const { column, ascending } of state.orderBy) {
      next = next.slice().sort((a, b) => {
        const av = a?.[column] ?? 0;
        const bv = b?.[column] ?? 0;
        return ascending ? (av > bv ? 1 : av < bv ? -1 : 0) : (av < bv ? 1 : av > bv ? -1 : 0);
      });
    }
    if (typeof state.limitCount === "number") next = next.slice(0, state.limitCount);
    return next;
  }

  function normalizeInsert(row) {
    const cloned = clone(row);
    if (!cloned.id) cloned.id = makeId(table.slice(0, 3));
    if (table === "milestone_submissions") {
      if (!cloned.submitted_at) cloned.submitted_at = new Date().toISOString();
      if (!cloned.revision_number) cloned.revision_number = 1;
    }
    return cloned;
  }

  function apply() {
    const rows = tables[table] || [];
    const matched = applyFilters(rows);

    if (state.pendingUpdate) {
      for (const row of rows) {
        if (state.filters.every((filter) => filter(row))) Object.assign(row, clone(state.pendingUpdate));
      }
      return applyFilters(rows);
    }

    if (state.pendingInsert) {
      const inserted = (Array.isArray(state.pendingInsert) ? state.pendingInsert : [state.pendingInsert]).map(normalizeInsert);
      tables[table].push(...inserted);
      return inserted;
    }

    if (state.pendingDelete) {
      tables[table] = rows.filter((row) => !state.filters.every((filter) => filter(row)));
      return matched;
    }

    return matched;
  }

  return api;
}

function requirements() {
  return {
    derivedAt: new Date().toISOString(),
    summary: ["Must use Next.js (framework).", "Must use TypeScript (language)."],
    constraints: ["Build with Next.js and TypeScript."],
    requiredFrameworks: ["nextjs"],
    sourceCount: 1,
    sources: [{ title: "Spec.pdf", type: "prd_pdf", evidence: ["Build with Next.js and TypeScript."] }],
    technologyRequirements: [
      { directive: "required", kind: "framework", rationale: "Build with Next.js.", choices: [{ slug: "nextjs", label: "Next.js", aliases: ["nextjs", "next.js", "next"], kind: "framework" }], sourceTitles: ["Spec.pdf"] },
      { directive: "required", kind: "language", rationale: "Use TypeScript.", choices: [{ slug: "typescript", label: "TypeScript", aliases: ["typescript", "ts"], kind: "language" }], sourceTitles: ["Spec.pdf"] },
    ],
  };
}

function projectRecord(id, repoUrl, overrides = {}) {
  return {
    id,
    name: id,
    type: "product_build",
    status: "active",
    progress_pct: 0,
    team_id: "team-eng",
    intake: {
      shape: "web-app",
      capabilities: ["frontend"],
      requirements: requirements(),
    },
    links: repoUrl ? { github: repoUrl } : {},
    github_repo_binding: repoUrl ? { url: repoUrl } : null,
    ...overrides,
  };
}

function baseTables(projects) {
  return {
    projects,
    sprints: [],
    sprint_items: [],
    jobs: [],
    agents: [{ id: "agent-eng", name: "Engineer", status: "idle", current_job_id: null }],
    teams: [{ id: "team-eng", name: "Engineering" }],
    team_members: [{ team_id: "team-eng", agent_id: "agent-eng", role: "lead" }],
    approvals: [],
    agent_events: [],
    milestone_submissions: [],
    proof_bundles: [],
    proof_items: [],
    submission_feedback_items: [],
    agent_notifications: [],
  };
}

function ensureRepo(slug, packageJson) {
  const repoDir = path.join(os.homedir(), ".openclaw", "workspace-tech-lead-architect", "projects", slug);
  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.mkdirSync(repoDir, { recursive: true });
  if (packageJson) fs.writeFileSync(path.join(repoDir, "package.json"), JSON.stringify(packageJson, null, 2));
  return repoDir;
}

const matchSlug = `prebuild-match-${Date.now()}`;
const mismatchSlug = `prebuild-mismatch-${Date.now()}`;
const manualSlug = `prebuild-manual-${Date.now()}`;
const missingWorkspaceSlug = `prebuild-missing-workspace-${Date.now()}`;

const createdRepos = [
  ensureRepo(matchSlug, { dependencies: { next: "16.1.6", react: "19.2.3" }, devDependencies: { typescript: "^5.0.0" } }),
  ensureRepo(mismatchSlug, { dependencies: { vite: "^7.0.0", react: "19.2.3" }, devDependencies: { typescript: "^5.0.0" } }),
  ensureRepo(manualSlug, null),
];

try {
  const createDbMatch = createDb(baseTables([projectRecord("project-live", `https://github.com/acme/${matchSlug}`)]));
  await seedProjectKickoffPlan(createDbMatch, {
    projectId: "project-live",
    projectName: "project-live",
    type: "product_build",
    intake: createDbMatch.tables.projects[0].intake,
    startPosition: 1,
  });
  await syncProjectPreBuildCheckpoint(createDbMatch, { projectId: "project-live", project: createDbMatch.tables.projects[0] });
  const buildSprintLive = createDbMatch.tables.sprints.find((row) => row.phase_key === "build");
  assert(buildSprintLive, "finalizeProjectCreate should create a Build sprint");
  assert.equal(buildSprintLive.approval_gate_required, true, "live path should automatically create the Build checkpoint when PRD requirements exist");
  assert.equal(buildSprintLive.approval_gate_status, "approved", "matching repo should auto-clear the Build checkpoint");
  assert(createDbMatch.tables.milestone_submissions.some((row) => row.sprint_id === buildSprintLive.id), "checkpoint should be visible through existing review submission surfaces");
  const liveDispatchResults = await dispatchEligibleProjectTasks(createDbMatch, {
    project: createDbMatch.tables.projects[0],
    tasks: createDbMatch.tables.sprint_items,
    sprints: createDbMatch.tables.sprints,
    jobs: createDbMatch.tables.jobs,
    agents: createDbMatch.tables.agents,
  });
  assert(liveDispatchResults.some((row) => row.dispatched), "live path should still dispatch eligible non-blocked work");

  const outcomesDb = createDb(baseTables([
    projectRecord("project-match", `https://github.com/acme/${matchSlug}`),
    projectRecord("project-mismatch", `https://github.com/acme/${mismatchSlug}`),
    projectRecord("project-manual", `https://github.com/acme/${missingWorkspaceSlug}`),
  ]));
  outcomesDb.tables.sprints.push(
    { id: "s-match", project_id: "project-match", name: "Phase 1 · Build", status: "active", phase_key: "build", approval_gate_required: false, approval_gate_status: "not_requested" },
    { id: "s-mismatch", project_id: "project-mismatch", name: "Phase 1 · Build", status: "active", phase_key: "build", approval_gate_required: false, approval_gate_status: "not_requested" },
    { id: "s-manual", project_id: "project-manual", name: "Phase 1 · Build", status: "active", phase_key: "build", approval_gate_required: false, approval_gate_status: "not_requested" },
  );
  const matchState = await syncProjectPreBuildCheckpoint(outcomesDb, { projectId: "project-match", project: outcomesDb.tables.projects[0] });
  const mismatchState = await syncProjectPreBuildCheckpoint(outcomesDb, { projectId: "project-mismatch", project: outcomesDb.tables.projects[1] });
  const manualState = await syncProjectPreBuildCheckpoint(outcomesDb, { projectId: "project-manual", project: outcomesDb.tables.projects[2] });
  assert.equal(matchState.state.outcome, "match");
  assert.equal(mismatchState.state.outcome, "mismatch");
  assert.equal(manualState.state.outcome, "manual_review");
  assert.equal(outcomesDb.tables.milestone_submissions.filter((row) => row.sprint_id === "s-manual").length, 0, "missing local repo workspace should stay on manual approval path instead of creating a dead review packet");
  assert.equal(outcomesDb.tables.proof_bundles.length, 2, "only materializable pre-build checkpoints should create proof bundles");

  const staleManualDb = createDb(baseTables([projectRecord("project-manual-stale", `https://github.com/acme/${missingWorkspaceSlug}`)]));
  staleManualDb.tables.sprints.push({ id: "s-manual-stale", project_id: "project-manual-stale", name: "Phase 1 · Build", status: "active", phase_key: "build", approval_gate_required: true, approval_gate_status: "pending" });
  staleManualDb.tables.milestone_submissions.push({ id: "ms-stale", sprint_id: "s-manual-stale", checkpoint_type: "prebuild_checkpoint", revision_number: 1, summary: "Pre-build stack checkpoint requires manual review", what_changed: "manual review", status: "submitted" });
  staleManualDb.tables.proof_bundles.push({ id: "pb-stale", submission_id: "ms-stale", title: "Phase 1 · Build pre-build checkpoint", summary: "manual review", completeness_status: "ready" });
  staleManualDb.tables.proof_items.push({ id: "pi-stale", proof_bundle_id: "pb-stale", kind: "note", label: "Checkpoint outcome", notes: "No repo workspace path found.", metadata: { checkpointOutcome: "manual_review", repoWorkspacePath: null }, sort_order: 0 });
  await syncProjectPreBuildCheckpoint(staleManualDb, { projectId: "project-manual-stale", project: staleManualDb.tables.projects[0] });
  assert.equal(staleManualDb.tables.milestone_submissions.length, 0, "sync should clear stale unusable pre-build submissions when no local repo workspace exists");
  assert.equal(staleManualDb.tables.proof_bundles.length, 0, "sync should clear stale unusable pre-build proof bundles when no local repo workspace exists");
  assert.equal(staleManualDb.tables.proof_items.length, 0, "sync should clear stale unusable pre-build proof items when no local repo workspace exists");

  const stalePacketState = deriveReviewCheckpointState({
    approvalGateStatus: "pending",
    reviewSummary: {
      latestSubmissionId: "ms-stale-ui",
      checkpointType: "prebuild_checkpoint",
      proofCompletenessStatus: "ready",
      proofItemCount: 1,
      latestDecisionNotes: "No repo workspace path found.",
      latestRejectionComment: "No repo workspace path found.",
    },
  });
  assert.equal(stalePacketState.key, "awaiting_materials", "stale error-only pre-build packets must not present as ready for review");
  assert.equal(stalePacketState.actionable, false, "stale error-only pre-build packets must not be actionable");

  const provisioningPendingDb = createDb(baseTables([
    projectRecord("project-provisioning", null, {
      intake: {
        shape: "web-app",
        capabilities: ["frontend"],
        requirements: requirements(),
        githubRepoProvisioning: {
          status: "pending",
          reason: "GitHub repo auto-provisioning has been queued for this net-new code-heavy project.",
        },
      },
    }),
  ]));
  provisioningPendingDb.tables.sprints.push({ id: "s-provisioning", project_id: "project-provisioning", name: "Phase 1 · Build", status: "active", phase_key: "build", approval_gate_required: true, approval_gate_status: "pending" });
  provisioningPendingDb.tables.milestone_submissions.push({ id: "ms-provisioning", sprint_id: "s-provisioning", checkpoint_type: "prebuild_checkpoint", revision_number: 1, summary: "stale", what_changed: "stale", status: "submitted" });
  provisioningPendingDb.tables.proof_bundles.push({ id: "pb-provisioning", submission_id: "ms-provisioning", title: "stale", summary: "stale", completeness_status: "ready" });
  await syncProjectPreBuildCheckpoint(provisioningPendingDb, { projectId: "project-provisioning", project: provisioningPendingDb.tables.projects[0] });
  assert.equal(provisioningPendingDb.tables.sprints[0].approval_gate_required, false, "pending repo provisioning should not surface a Build checkpoint yet");
  assert.equal(provisioningPendingDb.tables.sprints[0].approval_gate_status, "not_requested", "pending repo provisioning should keep the Build gate internal");
  assert.equal(provisioningPendingDb.tables.milestone_submissions.length, 0, "pending provisioning should clear stale pre-build review packets");

  const blockedDb = createDb(baseTables([projectRecord("project-blocked", `https://github.com/acme/${mismatchSlug}`)]));
  blockedDb.tables.sprints.push({ id: "s-blocked", project_id: "project-blocked", name: "Phase 1 · Build", status: "active", phase_key: "build", approval_gate_required: false, approval_gate_status: "not_requested" });
  blockedDb.tables.sprint_items.push({ id: "t-blocked", project_id: "project-blocked", sprint_id: "s-blocked", title: "Implement slice", status: "todo", assignee_agent_id: "agent-eng", task_type: "build_implementation", owner_team_id: "team-eng" });
  await syncProjectPreBuildCheckpoint(blockedDb, { projectId: "project-blocked", project: blockedDb.tables.projects[0] });
  const blockedDispatch = await dispatchEligibleProjectTasks(blockedDb, {
    project: blockedDb.tables.projects[0],
    tasks: blockedDb.tables.sprint_items,
    sprints: blockedDb.tables.sprints,
    jobs: blockedDb.tables.jobs,
    agents: blockedDb.tables.agents,
  });
  assert.equal(blockedDispatch[0].dispatched, false);
  assert.equal(blockedDispatch[0].blocker?.key, "waiting_for_approval", "Build dispatch should be blocked until the checkpoint is cleared");

  blockedDb.tables.sprints[0].approval_gate_status = "approved";
  const approvedDispatch = await dispatchEligibleProjectTasks(blockedDb, {
    project: blockedDb.tables.projects[0],
    tasks: blockedDb.tables.sprint_items,
    sprints: blockedDb.tables.sprints,
    jobs: blockedDb.tables.jobs,
    agents: blockedDb.tables.agents,
  });
  assert.equal(approvedDispatch[0].dispatched, false, "stack mismatch should still block Build even if the sprint gate was bypassed");
  assert.equal(approvedDispatch[0].blocker?.key, "waiting_for_approval");

  const bypassDb = createDb(baseTables([projectRecord("project-bypass", `https://github.com/acme/${mismatchSlug}`)]));
  bypassDb.tables.sprints.push({ id: "s-kickoff", project_id: "project-bypass", name: "Kickoff", status: "active", phase_key: "kickoff", approval_gate_required: false, approval_gate_status: "not_requested" });
  bypassDb.tables.sprint_items.push({ id: "t-bypass", project_id: "project-bypass", sprint_id: "s-kickoff", title: "Implement slice from wrong sprint", status: "todo", assignee_agent_id: "agent-eng", task_type: "build_implementation", owner_team_id: "team-eng" });
  const bypassDispatch = await dispatchEligibleProjectTasks(bypassDb, {
    project: bypassDb.tables.projects[0],
    tasks: bypassDb.tables.sprint_items,
    sprints: bypassDb.tables.sprints,
    jobs: bypassDb.tables.jobs,
    agents: bypassDb.tables.agents,
  });
  assert.equal(bypassDispatch[0].dispatched, false, "Build tasks outside the gated Build sprint must still be blocked by stack mismatch");
  assert.equal(bypassDispatch[0].blocker?.key, "waiting_for_approval");
  assert.match(bypassDispatch[0].blocker?.detail || "", /requires Next\.js|requires nextjs/i);

  console.log("verify-prebuild-checkpoint: ok");
} finally {
  for (const repoDir of createdRepos) fs.rmSync(repoDir, { recursive: true, force: true });
}

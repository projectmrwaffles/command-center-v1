import { buildReviewEventPayload } from "./milestone-review.ts";
import { getProjectRequirementCompliance } from "./project-requirements.ts";
import type { ProjectLikeWithRequirements, ProjectRequirements, RequirementCompliance } from "./project-requirements.types.ts";

type DbClient = { from: (table: string) => any } & Record<string, any>;

type SprintRow = {
  id: string;
  project_id: string;
  name: string;
  status: string;
  phase_key?: string | null;
  approval_gate_required?: boolean | null;
  approval_gate_status?: string | null;
};

type PreBuildCheckpointOutcome = "match" | "mismatch" | "manual_review";

type PreBuildCheckpointState = {
  applicable: boolean;
  outcome: PreBuildCheckpointOutcome | null;
  status: "approved" | "pending" | "not_requested";
  title: string | null;
  summary: string | null;
  reasons: string[];
  detected: {
    frameworks: string[];
    languages: string[];
    styling: string[];
    backends: string[];
    runtimes: string[];
    tooling: string[];
    databases: string[];
  };
  repoWorkspacePath: string | null;
  requirementsCount: number;
  inspectedRequirementCount: number;
  unsupportedRequirementCount: number;
};

const INSPECTABLE_KINDS = new Set(["framework", "language", "styling", "backend", "runtime", "tooling", "database"]);

function hasPrdDerivedRequirements(requirements: ProjectRequirements | null | undefined) {
  return Boolean(
    requirements?.technologyRequirements?.length
    && requirements.sources?.some((source) => source?.type !== "intake" && Array.isArray(source.evidence) && source.evidence.length > 0)
  );
}

function isBuildSprint(sprint: SprintRow) {
  return sprint.phase_key === "build" || /\bbuild\b/i.test(sprint.name || "");
}

export function derivePreBuildCheckpointState(project: ProjectLikeWithRequirements): PreBuildCheckpointState {
  const requirements = project.intake?.requirements;
  if (!hasPrdDerivedRequirements(requirements)) {
    return {
      applicable: false,
      outcome: null,
      status: "not_requested",
      title: null,
      summary: null,
      reasons: [],
      detected: { frameworks: [], languages: [], styling: [], backends: [], runtimes: [], tooling: [], databases: [] },
      repoWorkspacePath: null,
      requirementsCount: 0,
      inspectedRequirementCount: 0,
      unsupportedRequirementCount: 0,
    };
  }

  const compliance = getProjectRequirementCompliance(project);
  const inspectableRequirements = (requirements?.technologyRequirements || []).filter((requirement) => INSPECTABLE_KINDS.has(requirement.kind));
  const unsupportedRequirements = (requirements?.technologyRequirements || []).filter((requirement) => !INSPECTABLE_KINDS.has(requirement.kind));
  const notes = compliance.notes || [];
  const repoNotInspectable = !compliance.repoWorkspacePath || notes.some((note) => /package\.json not found|No repo workspace path found\./i.test(note));

  let outcome: PreBuildCheckpointOutcome = "match";
  const reasons: string[] = [];

  if (repoNotInspectable) {
    outcome = "manual_review";
    reasons.push(...notes);
  } else if (compliance.violations.length > 0) {
    outcome = "mismatch";
    reasons.push(...compliance.violations);
  } else if (inspectableRequirements.length === 0 || unsupportedRequirements.length > 0) {
    outcome = "manual_review";
    if (inspectableRequirements.length === 0) reasons.push("PRD-derived requirements exist, but none of them are machine-checkable against the repo yet.");
    if (unsupportedRequirements.length > 0) reasons.push(`Manual review required for unsupported requirement kinds: ${unsupportedRequirements.map((item) => item.kind).join(", ")}.`);
  }

  if (reasons.length === 0) {
    reasons.push("Repo stack matches the machine-checkable PRD requirements.");
  }

  const status = outcome === "match" ? "approved" : "pending";
  const title = outcome === "match"
    ? "Pre-build stack checkpoint auto-cleared"
    : outcome === "mismatch"
      ? "Pre-build stack mismatch requires approval"
      : "Pre-build stack checkpoint requires manual review";
  const summary = outcome === "match"
    ? "PRD stack requirements match the linked repo, so Build can dispatch automatically."
    : outcome === "mismatch"
      ? "PRD stack requirements conflict with the linked repo. Manual approval is required before Build can dispatch."
      : "PRD stack requirements could not be cleared automatically. Manual approval is required before Build can dispatch.";

  return {
    applicable: true,
    outcome,
    status,
    title,
    summary,
    reasons,
    detected: {
      frameworks: compliance.detectedFrameworks,
      languages: compliance.detectedLanguages,
      styling: compliance.detectedStyling,
      backends: compliance.detectedBackends,
      runtimes: compliance.detectedRuntimes,
      tooling: compliance.detectedTooling,
      databases: compliance.detectedDatabases,
    },
    repoWorkspacePath: compliance.repoWorkspacePath,
    requirementsCount: requirements?.technologyRequirements?.length || 0,
    inspectedRequirementCount: inspectableRequirements.length,
    unsupportedRequirementCount: unsupportedRequirements.length,
  };
}

function buildCheckpointProofItems(state: PreBuildCheckpointState, compliance: RequirementCompliance) {
  const detectedLines = [
    compliance.detectedFrameworks.length ? `Frameworks: ${compliance.detectedFrameworks.join(", ")}` : null,
    compliance.detectedLanguages.length ? `Languages: ${compliance.detectedLanguages.join(", ")}` : null,
    compliance.detectedStyling.length ? `Styling: ${compliance.detectedStyling.join(", ")}` : null,
    compliance.detectedBackends.length ? `Backends: ${compliance.detectedBackends.join(", ")}` : null,
    compliance.detectedRuntimes.length ? `Runtimes: ${compliance.detectedRuntimes.join(", ")}` : null,
    compliance.detectedTooling.length ? `Tooling: ${compliance.detectedTooling.join(", ")}` : null,
    compliance.detectedDatabases.length ? `Databases: ${compliance.detectedDatabases.join(", ")}` : null,
  ].filter(Boolean);

  return state.reasons.map((reason, index) => ({
    kind: "note",
    label: index === 0 ? "Checkpoint outcome" : `Checkpoint detail ${index}`,
    url: null,
    storage_path: null,
    notes: [reason, ...detectedLines, state.repoWorkspacePath ? `Repo workspace: ${state.repoWorkspacePath}` : null].filter(Boolean).join("\n\n"),
    metadata: {
      checkpointOutcome: state.outcome,
      repoWorkspacePath: state.repoWorkspacePath,
    },
    sort_order: index,
  }));
}

async function ensureCheckpointSubmission(db: DbClient, input: {
  projectId: string;
  sprint: SprintRow;
  state: PreBuildCheckpointState;
  compliance: RequirementCompliance;
}) {
  const { data: activeSubmission, error: activeSubmissionError } = await db
    .from("milestone_submissions")
    .select("id, approval_id, revision_number, status")
    .eq("sprint_id", input.sprint.id)
    .in("status", ["submitted", "under_review", "approved"])
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeSubmissionError) throw new Error(activeSubmissionError.message);

  if (activeSubmission?.id) {
    const now = new Date().toISOString();
    await db.from("milestone_submissions").update({
      status: input.state.status === "approved" ? "approved" : "submitted",
      decision: input.state.status === "approved" ? "approve" : null,
      decision_notes: input.state.reasons.join(" "),
      decided_at: input.state.status === "approved" ? now : null,
      summary: input.state.title,
      what_changed: input.state.summary,
      updated_at: now,
    }).eq("id", activeSubmission.id);

    const { data: bundle } = await db.from("proof_bundles").select("id").eq("submission_id", activeSubmission.id).maybeSingle();
    if (bundle?.id) {
      await db.from("proof_items").delete().eq("proof_bundle_id", bundle.id);
      const proofItems = buildCheckpointProofItems(input.state, input.compliance).map((item) => ({ ...item, proof_bundle_id: bundle.id }));
      if (proofItems.length > 0) await db.from("proof_items").insert(proofItems);
      await db.from("proof_bundles").update({
        title: `${input.sprint.name} pre-build checkpoint`,
        summary: input.state.summary,
        completeness_status: "ready",
      }).eq("id", bundle.id);
    }

    if (activeSubmission.approval_id) {
      await db.from("approvals").update({
        status: input.state.status === "approved" ? "approved" : "pending",
        note: input.state.reasons.join(" "),
        decided_at: input.state.status === "approved" ? now : null,
      }).eq("id", activeSubmission.approval_id);
    }

    return activeSubmission.id;
  }

  const now = new Date().toISOString();
  const { data: submission, error: submissionError } = await db
    .from("milestone_submissions")
    .insert({
      sprint_id: input.sprint.id,
      revision_number: 1,
      summary: input.state.title,
      what_changed: input.state.summary,
      risks: input.state.outcome === "mismatch" ? input.state.reasons.join(" ") : null,
      status: input.state.status === "approved" ? "approved" : "submitted",
      decision: input.state.status === "approved" ? "approve" : null,
      decision_notes: input.state.reasons.join(" "),
      decided_at: input.state.status === "approved" ? now : null,
      submitted_at: now,
    })
    .select()
    .single();

  if (submissionError || !submission) throw submissionError || new Error("Failed to create pre-build checkpoint submission");

  const { data: bundle, error: bundleError } = await db
    .from("proof_bundles")
    .insert({
      submission_id: submission.id,
      title: `${input.sprint.name} pre-build checkpoint`,
      summary: input.state.summary,
      completeness_status: "ready",
    })
    .select()
    .single();

  if (bundleError || !bundle) throw bundleError || new Error("Failed to create pre-build checkpoint proof bundle");

  const proofItems = buildCheckpointProofItems(input.state, input.compliance).map((item) => ({ ...item, proof_bundle_id: bundle.id }));
  if (proofItems.length > 0) {
    const { error: proofError } = await db.from("proof_items").insert(proofItems);
    if (proofError) throw proofError;
  }

  await db.from("agent_events").insert({
    agent_id: null,
    project_id: input.projectId,
    event_type: "prebuild_checkpoint_created",
    payload: buildReviewEventPayload({
      submissionId: submission.id,
      sprintId: input.sprint.id,
      revisionNumber: submission.revision_number,
      summary: input.state.title || "Pre-build checkpoint created",
      note: input.state.reasons.join(" "),
    }),
  });

  return submission.id;
}

export async function syncProjectPreBuildCheckpoint(db: DbClient, input: {
  projectId: string;
  project?: (ProjectLikeWithRequirements & { id?: string | null }) | null;
}) {
  const project = input.project || (await db.from("projects").select("id, name, intake, links, github_repo_binding").eq("id", input.projectId).single()).data;
  if (!project) throw new Error("Project not found for pre-build checkpoint sync");

  const state = derivePreBuildCheckpointState(project);
  const { data: sprintRows, error: sprintsError } = await db.from("sprints").select("id, project_id, name, status, phase_key, approval_gate_required, approval_gate_status").eq("project_id", input.projectId);
  if (sprintsError) throw new Error(sprintsError.message);

  const buildSprints = ((sprintRows || []) as SprintRow[]).filter(isBuildSprint);
  if (!buildSprints.length) return { applicable: state.applicable, updatedSprintIds: [], state };

  const compliance = state.applicable ? getProjectRequirementCompliance(project) : null;
  const updatedSprintIds: string[] = [];

  for (const sprint of buildSprints) {
    const updatePayload = state.applicable
      ? { approval_gate_required: true, approval_gate_status: state.status, updated_at: new Date().toISOString() }
      : { approval_gate_required: false, approval_gate_status: "not_requested", updated_at: new Date().toISOString() };

    await db.from("sprints").update(updatePayload).eq("id", sprint.id).eq("project_id", input.projectId);
    updatedSprintIds.push(sprint.id);

    if (state.applicable && compliance) {
      await ensureCheckpointSubmission(db, { projectId: input.projectId, sprint, state, compliance });
      await db.from("agent_events").insert({
        agent_id: null,
        project_id: input.projectId,
        event_type: "prebuild_checkpoint_evaluated",
        payload: {
          sprint_id: sprint.id,
          sprint_name: sprint.name,
          outcome: state.outcome,
          status: state.status,
          reasons: state.reasons,
          repo_workspace_path: state.repoWorkspacePath,
        },
      });
    }
  }

  return { applicable: state.applicable, updatedSprintIds, state };
}

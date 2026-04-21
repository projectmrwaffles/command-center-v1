import { getProjectArtifactIntegrity } from "./project-artifact-requirements.ts";
import { getProjectRequirementCompliance } from "./project-requirements.ts";
import { getSprintReviewEligibility, resolveSprintReviewSurface } from "./review-request-guards.ts";
import { buildReviewRequestContext, buildReviewRequestSummary, deriveReviewArtifacts, mergeProjectLinks } from "./review-requests.ts";
import { validateProofBundleRequirements } from "./milestone-review.ts";
import { resolveTaskAssignee } from "./project-execution.ts";

type DbClient = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> } & Record<string, any>;

async function resolveReviewOwner(db: DbClient, projectId: string, sprintId: string) {
  const pickOwnerFromTasks = async (tasks: Array<{ assignee_agent_id?: string | null; owner_team_id?: string | null; review_required?: boolean | null; task_type?: string | null }>) => {
    const prioritized = tasks.slice().sort((a, b) => {
      const aScore = Number(Boolean(a.review_required)) * 10 + Number(a.task_type === "qa_validation") * 5 + Number(a.task_type === "build_implementation");
      const bScore = Number(Boolean(b.review_required)) * 10 + Number(b.task_type === "qa_validation") * 5 + Number(b.task_type === "build_implementation");
      return bScore - aScore;
    });

    for (const task of prioritized) {
      const agentId = await resolveTaskAssignee(db as any, task);
      if (agentId) return agentId;
    }

    return null;
  };

  const { data: sprintTasks } = await db
    .from("sprint_items")
    .select("assignee_agent_id, owner_team_id, review_required, task_type")
    .eq("project_id", projectId)
    .eq("sprint_id", sprintId)
    .limit(25);

  const sprintAgentId = await pickOwnerFromTasks(sprintTasks || []);
  if (sprintAgentId) return sprintAgentId as string;

  const { data: projectTasks } = await db
    .from("sprint_items")
    .select("assignee_agent_id, owner_team_id, review_required, task_type")
    .eq("project_id", projectId)
    .limit(25);

  const projectAgentId = await pickOwnerFromTasks(projectTasks || []);
  if (projectAgentId) return projectAgentId as string;

  const { data: fallbackAgent } = await db.from("agents").select("id").limit(1).maybeSingle();
  return fallbackAgent?.id ?? null;
}

export async function syncMilestoneReviewRequest(db: DbClient, input: {
  projectId: string;
  sprintId: string;
  note?: string | null;
  links?: Record<string, unknown> | null;
}) {
  const [{ data: project }, { data: sprint }, { data: sprintTasks }, { data: pendingApproval }, { data: sprintReviewTasks }, { data: completionEvents }] = await Promise.all([
    db.from("projects").select("id, name, type, intake, links, github_repo_binding").eq("id", input.projectId).maybeSingle(),
    db.from("sprints").select("id, project_id, name, phase_key, checkpoint_type, approval_gate_required, approval_gate_status, delivery_review_required, delivery_review_status").eq("id", input.sprintId).eq("project_id", input.projectId).maybeSingle(),
    db.from("sprint_items").select("id, title, status, task_type, review_required").eq("project_id", input.projectId).eq("sprint_id", input.sprintId),
    db.from("approvals").select("id, status").eq("project_id", input.projectId).eq("sprint_id", input.sprintId).eq("status", "pending").maybeSingle(),
    db.from("sprint_items").select("id, title").eq("project_id", input.projectId).eq("sprint_id", input.sprintId).eq("review_required", true),
    db.from("agent_events").select("payload").eq("project_id", input.projectId).eq("event_type", "task_completed").order("timestamp", { ascending: false }).limit(100),
  ]);

  if (!project || !sprint || pendingApproval?.id) {
    return { created: false, reason: pendingApproval?.id ? "already_pending" : "missing_context" } as const;
  }

  const reviewSurface = resolveSprintReviewSurface({
    approvalGateRequired: sprint.approval_gate_required,
    approvalGateStatus: sprint.approval_gate_status,
    deliveryReviewRequired: sprint.delivery_review_required,
    deliveryReviewStatus: sprint.delivery_review_status,
    checkpointType: sprint.checkpoint_type,
    phaseKey: sprint.phase_key,
  });

  const effectiveReviewStatus = pendingApproval?.id
    ? reviewSurface.status
    : reviewSurface.status === "pending"
      ? "not_requested"
      : reviewSurface.status;

  const eligibility = getSprintReviewEligibility({
    approvalGateRequired: sprint.approval_gate_required,
    approvalGateStatus: reviewSurface.reviewKind === "approval_gate" ? effectiveReviewStatus : sprint.approval_gate_status,
    deliveryReviewRequired: sprint.delivery_review_required,
    deliveryReviewStatus: reviewSurface.reviewKind === "delivery_review" ? effectiveReviewStatus : sprint.delivery_review_status,
    checkpointType: sprint.checkpoint_type,
    phaseKey: sprint.phase_key,
    taskStatuses: (sprintTasks || []).map((task: any) => task.status),
  });

  if (!eligibility.ok) {
    return { created: false, reason: eligibility.reason } as const;
  }

  const mergedLinks = mergeProjectLinks(project.links, input.links);
  const artifactIntegrity = getProjectArtifactIntegrity(
    {
      type: project.type,
      intake: project.intake,
      links: mergedLinks || project.links,
      github_repo_binding: project.github_repo_binding,
    },
    sprintTasks || [],
  );
  if (artifactIntegrity.blockingReason) {
    return { created: false, reason: artifactIntegrity.blockingReason } as const;
  }

  const requirementCompliance = getProjectRequirementCompliance({
    name: project.name,
    intake: project.intake,
    links: mergedLinks || project.links,
    github_repo_binding: project.github_repo_binding,
  });
  if (requirementCompliance.violations.length > 0) {
    return { created: false, reason: `Review blocked: ${requirementCompliance.violations.join(" ")}` } as const;
  }

  if (reviewSurface.reviewKind === "delivery_review") {
    const { data: activeSubmission } = await db
      .from("milestone_submissions")
      .select("id, status, checkpoint_type, evidence_requirements")
      .eq("sprint_id", input.sprintId)
      .in("status", ["submitted", "under_review"])
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!activeSubmission?.id) return { created: false, reason: "missing_active_submission" } as const;

    const { data: proofBundle } = await db
      .from("proof_bundles")
      .select("id, completeness_status")
      .eq("submission_id", activeSubmission.id)
      .maybeSingle();
    if (!proofBundle?.id || proofBundle.completeness_status !== "ready") {
      return { created: false, reason: "proof_bundle_not_ready" } as const;
    }

    const { data: proofItems } = await db
      .from("proof_items")
      .select("kind")
      .eq("proof_bundle_id", proofBundle.id);
    const proofValidation = validateProofBundleRequirements({
      checkpointType: activeSubmission.checkpoint_type,
      evidenceRequirements: activeSubmission.evidence_requirements,
      items: proofItems || [],
    });
    if (!proofValidation.ok) return { created: false, reason: proofValidation.message || "proof_validation_failed" } as const;
  }

  if (typeof db.rpc !== "function") return { created: false, reason: "no_owner_agent" } as const;

  const ownerAgentId = await resolveReviewOwner(db, input.projectId, input.sprintId);
  if (!ownerAgentId) return { created: false, reason: "no_owner_agent" } as const;

  const derivedArtifacts = deriveReviewArtifacts({
    reviewTasks: (sprintReviewTasks || []) as Array<{ id: string; title?: string | null }>,
    completionEvents: (completionEvents || []) as Array<{ payload?: Record<string, unknown> | null }>,
    links: mergedLinks,
  });
  const summary = buildReviewRequestSummary({ projectName: project.name, sprintName: sprint.name });
  const context = buildReviewRequestContext({
    sprintId: sprint.id,
    sprintName: sprint.name,
    projectId: project.id,
    projectName: project.name,
    links: mergedLinks,
    note: input.note || null,
    artifacts: derivedArtifacts,
  });

  if (!pendingApproval?.id && reviewSurface.status === "pending") {
    const resetPayload = reviewSurface.reviewKind === "delivery_review"
      ? { delivery_review_status: "not_requested", updated_at: new Date().toISOString() }
      : { approval_gate_status: "not_requested", updated_at: new Date().toISOString() };
    await db
      .from("sprints")
      .update(resetPayload)
      .eq("id", input.sprintId)
      .eq("project_id", input.projectId);
  }

  const { data: rpcResult, error: rpcError } = await db.rpc("create_project_review_request", {
    p_project_id: input.projectId,
    p_sprint_id: input.sprintId,
    p_owner_agent_id: ownerAgentId,
    p_title: summary,
    p_job_summary: input.note || `Review requested for ${sprint.name}`,
    p_approval_summary: summary,
    p_links: mergedLinks,
    p_context: context,
  });

  if (rpcError || !Array.isArray(rpcResult) || !rpcResult[0]) {
    return { created: false, reason: rpcError?.message || "rpc_failed" } as const;
  }

  if (reviewSurface.reviewKind === "delivery_review") {
    await db
      .from("sprints")
      .update({
        approval_gate_status: sprint.approval_gate_status,
        delivery_review_required: true,
        delivery_review_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.sprintId)
      .eq("project_id", input.projectId);
  }

  return { created: true, reviewRequest: rpcResult[0] } as const;
}

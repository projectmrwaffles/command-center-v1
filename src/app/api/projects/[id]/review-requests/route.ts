import { getProjectArtifactIntegrity } from "@/lib/project-artifact-requirements";
import { validateProofBundleRequirements } from "@/lib/milestone-review";
import { getProjectRequirementCompliance } from "@/lib/project-requirements";
import { getSprintReviewEligibility, resolveSprintReviewSurface } from "@/lib/review-request-guards";
import { mergeProjectLinks, buildReviewRequestContext, buildReviewRequestSummary, deriveReviewArtifacts } from "@/lib/review-requests";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { selectProjectWithArtifactCompat } from "@/lib/project-db-compat";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

async function selectSprintTasksForReviewCompat(
  db: NonNullable<ReturnType<typeof createRouteHandlerClient>>,
  projectId: string,
  sprintId: string,
) {
  const first = await db.from("sprint_items").select("status, task_type").eq("project_id", projectId).eq("sprint_id", sprintId);

  if (!first.error || !(first.error.code === "PGRST204" || first.error.code === "42703") || !first.error.message?.includes("task_type")) {
    return first;
  }

  const fallback = await db.from("sprint_items").select("status").eq("project_id", projectId).eq("sprint_id", sprintId);
  return {
    ...fallback,
    data: (fallback.data || []).map((task: any) => ({ ...task, task_type: null })),
  };
}

async function resolveReviewOwner(db: NonNullable<ReturnType<typeof createRouteHandlerClient>>, projectId: string, sprintId: string) {
  const { data: sprintTasks } = await db
    .from("sprint_items")
    .select("assignee_agent_id")
    .eq("project_id", projectId)
    .eq("sprint_id", sprintId)
    .not("assignee_agent_id", "is", null)
    .limit(10);

  const sprintAgentId = sprintTasks?.find((task: any) => task.assignee_agent_id)?.assignee_agent_id;
  if (sprintAgentId) return sprintAgentId as string;

  const { data: projectTasks } = await db
    .from("sprint_items")
    .select("assignee_agent_id")
    .eq("project_id", projectId)
    .not("assignee_agent_id", "is", null)
    .limit(10);

  const projectAgentId = projectTasks?.find((task: any) => task.assignee_agent_id)?.assignee_agent_id;
  if (projectAgentId) return projectAgentId as string;

  const { data: fallbackAgent } = await db.from("agents").select("id").limit(1).maybeSingle();
  return fallbackAgent?.id ?? null;
}

function mapReviewRequestError(message: string | undefined) {
  if (!message) return { status: 500, error: "Failed to create review request" };

  if (
    message.includes("Milestone is not review-gated") ||
    message.includes("Milestone has already been approved") ||
    message.includes("Milestone needs at least one task") ||
    message.includes("Finish milestone tasks before requesting review") ||
    message.includes("Review request already pending for this milestone")
  ) {
    return { status: 409, error: message };
  }

  if (message.includes("Milestone not found")) {
    return { status: 404, error: message };
  }

  return { status: 500, error: message };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const params = await ctx.params;
    const projectId = params.id;
    const body = await req.json();
    const sprintId = typeof body?.sprintId === "string" ? body.sprintId : "";
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

    if (!projectId || !sprintId) {
      return NextResponse.json({ error: "Project ID and sprint ID required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const [{ data: project, error: projectError }, { data: sprint, error: sprintError }, { data: sprintTasks, error: sprintTasksError }, { data: pendingApproval, error: pendingApprovalError }, { data: sprintReviewTasks }, { data: completionEvents }] = await Promise.all([
      selectProjectWithArtifactCompat(db, projectId, "id, name, type, intake, links, github_repo_binding"),
      db.from("sprints").select("id, project_id, name, phase_key, checkpoint_type, approval_gate_required, approval_gate_status, delivery_review_required, delivery_review_status").eq("id", sprintId).eq("project_id", projectId).single(),
      selectSprintTasksForReviewCompat(db, projectId, sprintId),
      db.from("approvals").select("id").eq("project_id", projectId).eq("sprint_id", sprintId).eq("status", "pending").maybeSingle(),
      db.from("sprint_items").select("id, title").eq("project_id", projectId).eq("sprint_id", sprintId).eq("review_required", true),
      db.from("agent_events").select("payload").eq("project_id", projectId).eq("event_type", "task_completed").order("timestamp", { ascending: false }).limit(100),
    ]);

    if (projectError || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (sprintError || !sprint) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    if (sprintTasksError) return NextResponse.json({ error: sprintTasksError.message || "Failed to inspect milestone tasks" }, { status: 500 });
    if (pendingApprovalError) return NextResponse.json({ error: pendingApprovalError.message || "Failed to inspect milestone review state" }, { status: 500 });

    const reviewSurface = resolveSprintReviewSurface({
      approvalGateRequired: sprint.approval_gate_required,
      approvalGateStatus: sprint.approval_gate_status,
      deliveryReviewRequired: sprint.delivery_review_required,
      deliveryReviewStatus: sprint.delivery_review_status,
      checkpointType: sprint.checkpoint_type,
      phaseKey: sprint.phase_key,
    });
    const reviewStatusColumn = reviewSurface.reviewKind === "delivery_review" ? "delivery_review_status" : "approval_gate_status";
    const reviewStatus = reviewSurface.status;
    const effectiveReviewStatus = pendingApproval?.id
      ? reviewStatus
      : reviewStatus === "pending"
        ? "not_requested"
        : reviewStatus;

    if (!pendingApproval?.id && reviewStatus === "pending") {
      const repairPayload = reviewSurface.reviewKind === "delivery_review"
        ? { delivery_review_status: "not_requested", updated_at: new Date().toISOString() }
        : { approval_gate_status: "not_requested", updated_at: new Date().toISOString() };
      const { error: sprintRepairError } = await db
        .from("sprints")
        .update(repairPayload)
        .eq("id", sprintId)
        .eq("project_id", projectId);

      if (sprintRepairError) {
        return NextResponse.json({ error: sprintRepairError.message || "Failed to repair milestone review state" }, { status: 500 });
      }

      sprint[reviewStatusColumn] = "not_requested";
    }

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
      const status = eligibility.reason.includes("already pending") ? 409 : 400;
      return NextResponse.json({ error: eligibility.reason }, { status });
    }

    const mergedLinks = mergeProjectLinks(project.links, body?.links);
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
      return NextResponse.json({ error: artifactIntegrity.blockingReason }, { status: 400 });
    }

    const requirementCompliance = getProjectRequirementCompliance({
      name: project.name,
      intake: project.intake,
      links: mergedLinks || project.links,
      github_repo_binding: project.github_repo_binding,
    });

    if (requirementCompliance.violations.length > 0) {
      return NextResponse.json({ error: `Review blocked: ${requirementCompliance.violations.join(" ")}` }, { status: 400 });
    }

    if (reviewSurface.reviewKind === "delivery_review") {
      const { data: activeSubmission, error: activeSubmissionError } = await db
        .from("milestone_submissions")
        .select("id, status, checkpoint_type, evidence_requirements")
        .eq("sprint_id", sprintId)
        .in("status", ["submitted", "under_review"])
        .order("revision_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSubmissionError) {
        return NextResponse.json({ error: activeSubmissionError.message || "Failed to inspect review submission state" }, { status: 500 });
      }

      if (!activeSubmission?.id) {
        return NextResponse.json({ error: "Build delivery review must be submitted with screenshot proof before a review request can be created" }, { status: 409 });
      }

      const { data: proofBundle, error: proofBundleError } = await db
        .from("proof_bundles")
        .select("id, completeness_status")
        .eq("submission_id", activeSubmission.id)
        .maybeSingle();

      if (proofBundleError) {
        return NextResponse.json({ error: proofBundleError.message || "Failed to inspect review proof bundle" }, { status: 500 });
      }

      if (!proofBundle?.id || proofBundle.completeness_status !== "ready") {
        return NextResponse.json({ error: "Build delivery review requires a ready proof bundle with screenshot evidence before review can be requested" }, { status: 409 });
      }

      const { data: proofItems, error: proofItemsError } = await db
        .from("proof_items")
        .select("kind")
        .eq("proof_bundle_id", proofBundle.id);

      if (proofItemsError) {
        return NextResponse.json({ error: proofItemsError.message || "Failed to inspect review proof items" }, { status: 500 });
      }

      const proofValidation = validateProofBundleRequirements({
        checkpointType: activeSubmission.checkpoint_type,
        evidenceRequirements: activeSubmission.evidence_requirements,
        items: proofItems || [],
      });

      if (!proofValidation.ok) {
        return NextResponse.json({ error: proofValidation.message, evidenceRequirements: proofValidation.requirements, screenshotCount: proofValidation.screenshotCount }, { status: 409 });
      }
    }

    const ownerAgentId = await resolveReviewOwner(db, projectId, sprintId);
    if (!ownerAgentId) {
      return NextResponse.json({ error: "No agent available to own this review request" }, { status: 400 });
    }

    const derivedArtifacts = deriveReviewArtifacts({
      reviewTasks: (sprintReviewTasks || []) as Array<{ id: string; title?: string | null }>,
      completionEvents: (completionEvents || []) as Array<{ payload?: Record<string, unknown> | null }>,
    });

    const summary = buildReviewRequestSummary({ projectName: project.name, sprintName: sprint.name });
    const context = buildReviewRequestContext({
      sprintId: sprint.id,
      sprintName: sprint.name,
      projectId: project.id,
      projectName: project.name,
      links: mergedLinks,
      note,
      artifacts: derivedArtifacts,
    });

    const { data: rpcResult, error: rpcError } = await db.rpc("create_project_review_request", {
      p_project_id: projectId,
      p_sprint_id: sprintId,
      p_owner_agent_id: ownerAgentId,
      p_title: summary,
      p_job_summary: note || `Review requested for ${sprint.name}`,
      p_approval_summary: summary,
      p_links: mergedLinks,
      p_context: context,
    });

    if (rpcError || !Array.isArray(rpcResult) || !rpcResult[0]) {
      const mapped = mapReviewRequestError(rpcError?.message);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    if (reviewSurface.reviewKind === "delivery_review") {
      const { error: sprintStateError } = await db
        .from("sprints")
        .update({
          approval_gate_status: sprint.approval_gate_status,
          delivery_review_required: true,
          delivery_review_status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sprintId)
        .eq("project_id", projectId);

      if (sprintStateError) {
        return NextResponse.json({ error: sprintStateError.message || "Failed to persist delivery review state" }, { status: 500 });
      }
    }

    const created = rpcResult[0] as {
      approval_id: string;
      approval_status: string;
      approval_summary: string;
      approval_sprint_id: string;
      approval_context: Record<string, unknown> | null;
      job_id: string;
      job_title: string;
      job_status: string;
      links: Record<string, unknown> | null;
    };

    return NextResponse.json(
      {
        approval: {
          id: created.approval_id,
          status: created.approval_status,
          summary: created.approval_summary,
          sprint_id: created.approval_sprint_id,
          context: created.approval_context,
        },
        job: {
          id: created.job_id,
          title: created.job_title,
          status: created.job_status,
        },
        links: created.links,
      },
      { status: 201 },
    );
  } catch (e: unknown) {
    console.error("[API /projects/:id/review-requests] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { getProjectArtifactIntegrity } from "@/lib/project-artifact-requirements";
import { getSprintReviewEligibility } from "@/lib/review-request-guards";
import { mergeProjectLinks, buildReviewRequestContext, buildReviewRequestSummary } from "@/lib/review-requests";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { selectProjectWithArtifactCompat } from "@/lib/project-db-compat";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

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

    const [{ data: project, error: projectError }, { data: sprint, error: sprintError }, { data: sprintTasks, error: sprintTasksError }] = await Promise.all([
      selectProjectWithArtifactCompat(db, projectId, "id, name, type, intake"),
      db.from("sprints").select("id, project_id, name, approval_gate_required, approval_gate_status").eq("id", sprintId).eq("project_id", projectId).single(),
      db.from("sprint_items").select("status, task_type").eq("project_id", projectId).eq("sprint_id", sprintId),
    ]);

    if (projectError || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (sprintError || !sprint) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    if (sprintTasksError) return NextResponse.json({ error: sprintTasksError.message || "Failed to inspect milestone tasks" }, { status: 500 });

    const eligibility = getSprintReviewEligibility({
      approvalGateRequired: sprint.approval_gate_required,
      approvalGateStatus: sprint.approval_gate_status,
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
      sprintTasks || []
    );

    if (artifactIntegrity.blockingReason) {
      return NextResponse.json({ error: artifactIntegrity.blockingReason }, { status: 400 });
    }

    const ownerAgentId = await resolveReviewOwner(db, projectId, sprintId);
    if (!ownerAgentId) {
      return NextResponse.json({ error: "No agent available to own this review request" }, { status: 400 });
    }

    const summary = buildReviewRequestSummary({ projectName: project.name, sprintName: sprint.name });
    const context = buildReviewRequestContext({
      sprintId: sprint.id,
      sprintName: sprint.name,
      projectId: project.id,
      projectName: project.name,
      links: mergedLinks,
      note,
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

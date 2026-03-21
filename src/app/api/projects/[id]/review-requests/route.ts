import { mergeProjectLinks, buildReviewRequestContext, buildReviewRequestSummary } from "@/lib/review-requests";
import { createRouteHandlerClient } from "@/lib/supabase-server";
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

    const [{ data: project, error: projectError }, { data: sprint, error: sprintError }] = await Promise.all([
      db.from("projects").select("id, name, links").eq("id", projectId).single(),
      db.from("sprints").select("id, project_id, name, approval_gate_required, approval_gate_status").eq("id", sprintId).eq("project_id", projectId).single(),
    ]);

    if (projectError || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (sprintError || !sprint) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

    const ownerAgentId = await resolveReviewOwner(db, projectId, sprintId);
    if (!ownerAgentId) {
      return NextResponse.json({ error: "No agent available to own this review request" }, { status: 400 });
    }

    const mergedLinks = mergeProjectLinks(project.links, body?.links);
    const summary = buildReviewRequestSummary({ projectName: project.name, sprintName: sprint.name });
    const context = buildReviewRequestContext({
      sprintId: sprint.id,
      sprintName: sprint.name,
      projectId: project.id,
      projectName: project.name,
      links: mergedLinks,
      note,
    });

    const { data: reviewJob, error: jobError } = await db
      .from("jobs")
      .insert({
        project_id: projectId,
        title: summary,
        status: "waiting_approval",
        owner_agent_id: ownerAgentId,
        summary: note || `Review requested for ${sprint.name}`,
      })
      .select("id, title, status")
      .single();

    if (jobError || !reviewJob) {
      return NextResponse.json({ error: jobError?.message || "Failed to create review job" }, { status: 500 });
    }

    const { data: approval, error: approvalError } = await db
      .from("approvals")
      .insert({
        job_id: reviewJob.id,
        agent_id: ownerAgentId,
        project_id: projectId,
        sprint_id: sprintId,
        status: "pending",
        summary,
        requester_name: "Command Center",
        severity: "medium",
        context,
      })
      .select("id, status, summary, sprint_id, context")
      .single();

    if (approvalError || !approval) {
      return NextResponse.json({ error: approvalError?.message || "Failed to create review request" }, { status: 500 });
    }

    const [{ error: projectUpdateError }, { error: sprintUpdateError }, { error: eventError }] = await Promise.all([
      db.from("projects").update({ links: mergedLinks, updated_at: new Date().toISOString() }).eq("id", projectId),
      db.from("sprints").update({ approval_gate_status: "pending", updated_at: new Date().toISOString() }).eq("id", sprintId),
      db.from("agent_events").insert({
        agent_id: ownerAgentId,
        project_id: projectId,
        job_id: reviewJob.id,
        event_type: "project_review_requested",
        payload: context,
      }),
    ]);

    if (projectUpdateError || sprintUpdateError || eventError) {
      return NextResponse.json({ error: projectUpdateError?.message || sprintUpdateError?.message || eventError?.message || "Failed to finalize review request" }, { status: 500 });
    }

    return NextResponse.json({ approval, job: reviewJob, links: mergedLinks }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects/:id/review-requests] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

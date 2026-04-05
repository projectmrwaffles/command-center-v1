import { ensureDefaultSprint, getProjectTaskPosition, syncProjectState } from "@/lib/project-state";
import { dispatchEligibleProjectTasks, getLeadAgentForTeam } from "@/lib/project-execution";
import { buildTaskMetadata, generateTaskDescription, generateTaskTitle, getRoutingPreview, getTaskTemplateKey, isTaskType, type TaskType } from "@/lib/task-model";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const params = await ctx.params;
    const projectId = params.id;
    const body = await req.json();
    const { title, sprint_id, description, notes, assignee_agent_id, assignee_user_id, task_type, task_goal, task_metadata, context_note, review_required, title_override } = body;

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const structuredCreate = isTaskType(task_type);

    if (!structuredCreate && !title?.trim()) {
      return NextResponse.json({ error: "Title required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const position = await getProjectTaskPosition(db, projectId);
    const fallbackSprintId = sprint_id ?? await ensureDefaultSprint(db, projectId);

    let insertPayload: Record<string, unknown> = {
      project_id: projectId,
      sprint_id: fallbackSprintId,
      title: typeof title === "string" ? title.trim() : "",
      description: description || notes || null,
      status: "todo",
      assignee_agent_id: assignee_agent_id ?? null,
      assignee_user_id: assignee_user_id ?? null,
      position,
    };

    if (structuredCreate) {
      if (typeof task_goal !== "string" || !task_goal.trim()) {
        return NextResponse.json({ error: "Task goal required" }, { status: 400 });
      }

      const metadata = buildTaskMetadata(task_type as TaskType, task_metadata || {});
      const routing = getRoutingPreview(task_type as TaskType);
      const ownerTeamName = routing.ownerTeamLabel;
      const { data: ownerTeam } = await db
        .from("teams")
        .select("id, name")
        .ilike("name", ownerTeamName)
        .limit(1)
        .maybeSingle();

      const generatedTitle = generateTaskTitle(task_type as TaskType, task_goal, metadata);
      const effectiveTitle = typeof title_override === "string" && title_override.trim() ? title_override.trim() : generatedTitle;
      const effectiveReviewRequired = typeof review_required === "boolean" ? review_required : routing.reviewRequired;

      const resolvedAssigneeAgentId = assignee_agent_id ?? await getLeadAgentForTeam(db, ownerTeam?.id ?? null);

      insertPayload = {
        ...insertPayload,
        title: effectiveTitle,
        description: generateTaskDescription({ taskType: task_type as TaskType, taskGoal: task_goal, metadata, contextNote: typeof context_note === "string" ? context_note : null }),
        assignee_agent_id: resolvedAssigneeAgentId ?? null,
        task_type,
        task_goal: task_goal.trim(),
        owner_team_id: ownerTeam?.id ?? null,
        review_required: effectiveReviewRequired,
        task_template_key: getTaskTemplateKey(task_type as TaskType, metadata),
        task_metadata: metadata,
        review_status: "not_requested",
      };
    }

    let { data, error } = await db
      .from("sprint_items")
      .insert(insertPayload)
      .select()
      .single();

    const missingStructuredColumn = error?.code === "PGRST204";
    if (error && structuredCreate && missingStructuredColumn) {
      const fallbackPayload = {
        project_id: projectId,
        sprint_id: fallbackSprintId,
        title: String(insertPayload.title || ""),
        description: String(insertPayload.description || ""),
        status: "todo",
        assignee_agent_id: assignee_agent_id ?? null,
        assignee_user_id: assignee_user_id ?? null,
        position,
      };

      const fallbackResult = await db
        .from("sprint_items")
        .insert(fallbackPayload)
        .select()
        .single();

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      console.error("[API /projects/:id/tasks] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await syncProjectState(db, projectId);

    const [{ data: project }, { data: sprints }, { data: jobs }, { data: agents }] = await Promise.all([
      db.from("projects").select("id, name, type, intake, links, github_repo_binding").eq("id", projectId).single(),
      db.from("sprints").select("id, name, status, phase_order, created_at, approval_gate_required, approval_gate_status").eq("project_id", projectId),
      db.from("jobs").select("id, owner_agent_id, project_id, status, summary, updated_at").eq("project_id", projectId).in("status", ["queued", "in_progress", "blocked"]),
      db.from("agents").select("id, status, current_job_id").not("name", "like", "_archived_%"),
    ]);

    if (project) {
      await dispatchEligibleProjectTasks(db as any, {
        project,
        tasks: [data as any],
        sprints: (sprints ?? []) as any,
        jobs: (jobs ?? []) as any,
        agents: (agents ?? []) as any,
      });
    }

    await db.from("agent_events").insert({
      project_id: projectId,
      agent_id: null,
      event_type: "task_created",
      payload: { task_id: data.id, title: data.title, sprint_id: data.sprint_id ?? null, task_type: data.task_type ?? null, task_goal: data.task_goal ?? null, review_required: data.review_required ?? null },
    });

    return NextResponse.json({ task: data }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects/:id/tasks] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

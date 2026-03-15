import { normalizeTaskPatch, syncProjectState } from "@/lib/project-state";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

async function getProjectTask(db: NonNullable<ReturnType<typeof createRouteHandlerClient>>, projectId: string, taskId: string) {
  const { data: task, error } = await db
    .from("sprint_items")
    .select("id, project_id, sprint_id, title, status, description")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .single();

  if (error || !task) {
    return null;
  }

  return task;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const params = await ctx.params;
    const projectId = params.id;
    const taskId = params.taskId;
    const body = await req.json();

    if (!projectId || !taskId) {
      return NextResponse.json({ error: "Project ID and task ID required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const existingTask = await getProjectTask(db, projectId, taskId);
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    let updateData: Record<string, string>;
    try {
      updateData = normalizeTaskPatch(body);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Invalid task update";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await db
      .from("sprint_items")
      .update(updateData)
      .eq("id", taskId)
      .eq("project_id", projectId)
      .select()
      .single();

    if (error) {
      console.error("[API /projects/:id/tasks/:taskId] update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const projectState = await syncProjectState(db, projectId);

    await db.from("agent_events").insert({
      agent_id: null,
      project_id: projectId,
      event_type: "task_updated",
      payload: {
        task_id: taskId,
        previous_status: existingTask.status,
        status: data.status,
        title: data.title,
        notes: data.description,
        project_progress_pct: projectState.progressPct,
      },
    });

    return NextResponse.json({ task: data, projectState });
  } catch (e: unknown) {
    console.error("[API /projects/:id/tasks/:taskId] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const params = await ctx.params;
    const projectId = params.id;
    const taskId = params.taskId;

    if (!projectId || !taskId) {
      return NextResponse.json({ error: "Project ID and task ID required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const existingTask = await getProjectTask(db, projectId, taskId);
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { error } = await db
      .from("sprint_items")
      .delete()
      .eq("id", taskId)
      .eq("project_id", projectId);

    if (error) {
      console.error("[API /projects/:id/tasks/:taskId] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const projectState = await syncProjectState(db, projectId);

    await db.from("agent_events").insert({
      agent_id: null,
      project_id: projectId,
      event_type: "task_deleted",
      payload: {
        task_id: taskId,
        title: existingTask.title,
        previous_status: existingTask.status,
        project_progress_pct: projectState.progressPct,
      },
    });

    return NextResponse.json({ success: true, projectState });
  } catch (e: unknown) {
    console.error("[API /projects/:id/tasks/:taskId] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

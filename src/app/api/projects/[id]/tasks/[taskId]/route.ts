import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Check if all tasks are done and update project status
 */
async function checkAndCompleteProject(db: any, projectId: string): Promise<void> {
  const { data: tasks } = await db
    .from("sprint_items")
    .select("status")
    .eq("project_id", projectId);
  
  if (!tasks || tasks.length === 0) return;
  
  const allDone = tasks.every((t: any) => t.status === "done");
  
  if (allDone && tasks.length > 0) {
    await db
      .from("projects")
      .update({ status: "completed", progress_pct: 100 })
      .eq("id", projectId);
    
    await db.from("agent_events").insert({
      agent_id: null,
      project_id: projectId,
      event_type: "project_completed",
      payload: { message: "All tasks completed" },
    });
    
    console.log(`[Project] Marked as completed: ${projectId}`);
  } else {
    const doneCount = tasks.filter((t: any) => t.status === "done").length;
    const progress = Math.round((doneCount / tasks.length) * 100);
    await db
      .from("projects")
      .update({ progress_pct: progress })
      .eq("id", projectId);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const params = await ctx.params;
    const taskId = params.taskId;
    const body = await req.json();
    const { status, notes } = body;

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const updateData: { status?: string; description?: string } = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.description = notes;

    const { data, error } = await db
      .from("sprint_items")
      .update(updateData)
      .eq("id", taskId)
      .select()
      .single();

    if (error) {
      console.error("[API /projects/:id/tasks/:taskId] update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log event
    await db.from("agent_events").insert({
      agent_id: null,
      project_id: params.id,
      event_type: "task_updated",
      payload: { task_id: taskId, status, notes },
    });

    // Check if project should be completed
    if (status) {
      await checkAndCompleteProject(db, params.id);
    }

    return NextResponse.json({ task: data });
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
    const params = await ctx.params;
    const taskId = params.taskId;

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { error } = await db
      .from("sprint_items")
      .delete()
      .eq("id", taskId);

    if (error) {
      console.error("[API /projects/:id/tasks/:taskId] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[API /projects/:id/tasks/:taskId] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

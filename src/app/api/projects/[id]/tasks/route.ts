import { ensureDefaultSprint, getProjectTaskPosition, syncProjectState } from "@/lib/project-state";
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
    const { title, sprint_id, description, notes, assignee_agent_id } = body;

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const position = await getProjectTaskPosition(db, projectId);
    const fallbackSprintId = sprint_id ?? await ensureDefaultSprint(db, projectId);

    const { data, error } = await db
      .from("sprint_items")
      .insert({
        project_id: projectId,
        sprint_id: fallbackSprintId,
        title: title.trim(),
        description: description || notes || null,
        status: "todo",
        assignee_agent_id: assignee_agent_id ?? null,
        position,
      })
      .select()
      .single();

    if (error) {
      console.error("[API /projects/:id/tasks] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await syncProjectState(db, projectId);

    await db.from("agent_events").insert({
      project_id: projectId,
      agent_id: null,
      event_type: "task_created",
      payload: { task_id: data.id, title: data.title, sprint_id: data.sprint_id ?? null },
    });

    return NextResponse.json({ task: data }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects/:id/tasks] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

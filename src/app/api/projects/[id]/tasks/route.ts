import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const params = await ctx.params;
    const projectId = params.id;
    const body = await req.json();
    const { title, sprint_id } = body;

    if (!title || !sprint_id) {
      return NextResponse.json({ error: "Title and sprint_id required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data, error } = await db
      .from("sprint_items")
      .insert({
        project_id: projectId,
        sprint_id,
        title,
        status: "todo",
        position: 1,
      })
      .select()
      .single();

    if (error) {
      console.error("[API /projects/:id/tasks] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log event
    await db.from("agent_events").insert({
      project_id: projectId,
      agent_id: null,
      event_type: "task_created",
      payload: { title, sprint_id },
    });

    return NextResponse.json({ task: data }, { status: 201 });
  } catch (e: any) {
    console.error("[API /projects/:id/tasks] exception:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

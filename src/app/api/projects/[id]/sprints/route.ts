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
    const { name, goal, start_date, end_date } = body;

    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data, error } = await db
      .from("sprints")
      .insert({
        project_id: projectId,
        name,
        goal: goal || null,
        start_date: start_date || new Date().toISOString().split("T")[0],
        end_date: end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        status: "active",
      })
      .select()
      .single();

    if (error) {
      console.error("[API /projects/:id/sprints] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log event
    await db.from("agent_events").insert({
      project_id: projectId,
      agent_id: null,
      event_type: "sprint_created",
      payload: { name, goal },
    });

    return NextResponse.json({ sprint: data }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects/:id/sprints] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

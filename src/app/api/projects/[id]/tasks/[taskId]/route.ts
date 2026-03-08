import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

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

    const updateData: any = {};
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
      event_type: "task_updated",
      payload: { task_id: taskId, status, notes },
    });

    return NextResponse.json({ task: data });
  } catch (e: any) {
    console.error("[API /projects/:id/tasks/:taskId] exception:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
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
  } catch (e: any) {
    console.error("[API /projects/:id/tasks/:taskId] exception:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

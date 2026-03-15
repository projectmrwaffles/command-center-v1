import { createRouteHandlerClient } from "@/lib/supabase-server";
import { hasBearerToken } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_AGENT_STATUSES = new Set(["active", "idle", "offline", "error"]);
const ALLOWED_TASK_STATUSES = new Set(["todo", "in_progress", "blocked", "done"]);

async function getTaskScope(
  db: NonNullable<ReturnType<typeof createRouteHandlerClient>>,
  taskId: string
) {
  const { data, error } = await db
    .from("sprint_items")
    .select("id, project_id, status")
    .eq("id", taskId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function POST(req: NextRequest) {
  try {
    if (!hasBearerToken(req, "AGENT_AUTH_TOKEN")) {
      const configured = Boolean(process.env.AGENT_AUTH_TOKEN?.trim());
      return NextResponse.json(
        { error: configured ? "Unauthorized" : "AGENT_AUTH_TOKEN is not configured" },
        { status: configured ? 401 : 503 }
      );
    }

    const body = await req.json();
    const { action, data } = body ?? {};

    if (!action || !data || typeof data !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    switch (action) {
      case "status": {
        const { agent_id, status, job_id } = data as Record<string, string | null | undefined>;
        if (!agent_id || !status) {
          return NextResponse.json({ error: "agent_id and status are required" }, { status: 400 });
        }
        if (!ALLOWED_AGENT_STATUSES.has(status)) {
          return NextResponse.json({ error: "Invalid agent status" }, { status: 400 });
        }
        const { error } = await db
          .from("agents")
          .update({ status, last_seen: new Date().toISOString(), current_job_id: job_id || null })
          .eq("id", agent_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }
      case "usage": {
        const payload = data as Record<string, unknown>;
        if (!payload.agent_id || !payload.model || !payload.provider) {
          return NextResponse.json({ error: "agent_id, model, and provider are required" }, { status: 400 });
        }
        const tokensIn = Number(payload.tokens_in ?? 0);
        const tokensOut = Number(payload.tokens_out ?? 0);
        const costUsd = Number(payload.cost_usd ?? 0);
        if ([tokensIn, tokensOut, costUsd].some((value) => !Number.isFinite(value) || value < 0)) {
          return NextResponse.json({ error: "Usage metrics must be finite non-negative numbers" }, { status: 400 });
        }
        const { error } = await db.from("ai_usage").insert({
          agent_id: payload.agent_id,
          model: payload.model,
          provider: payload.provider,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          total_tokens: tokensIn + tokensOut,
          cost_usd: costUsd,
          project_id: payload.project_id ?? null,
          job_id: payload.job_id ?? null,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }
      case "event": {
        const payload = data as Record<string, unknown>;
        if (!payload.agent_id || !payload.event_type) {
          return NextResponse.json({ error: "agent_id and event_type are required" }, { status: 400 });
        }
        const { error } = await db.from("agent_events").insert({
          agent_id: payload.agent_id,
          event_type: payload.event_type,
          project_id: payload.project_id ?? null,
          job_id: payload.job_id ?? null,
          payload: payload.payload ?? null,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }
      case "task_update": {
        const payload = data as Record<string, unknown>;
        const taskId = typeof payload.task_id === "string" ? payload.task_id : "";
        const status = typeof payload.status === "string" ? payload.status : "";
        const projectId = typeof payload.project_id === "string" ? payload.project_id : null;

        if (!taskId || !status) {
          return NextResponse.json({ error: "task_id and status are required" }, { status: 400 });
        }
        if (!ALLOWED_TASK_STATUSES.has(status)) {
          return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
        }

        const existingTask = await getTaskScope(db, taskId);
        if (!existingTask) {
          return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }
        if (projectId && existingTask.project_id !== projectId) {
          return NextResponse.json({ error: "Task does not belong to the provided project" }, { status: 409 });
        }

        const update: { status: string; description?: string } = { status };
        if (typeof payload.description === "string" && payload.description.trim()) {
          update.description = payload.description.trim();
        }

        const { error } = await db
          .from("sprint_items")
          .update(update)
          .eq("id", taskId)
          .eq("project_id", existingTask.project_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, project_id: existingTask.project_id });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

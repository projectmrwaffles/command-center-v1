import { createRouteHandlerClient } from "@/lib/supabase-server";
import { hasBearerToken } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

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
        const { error } = await db.from("ai_usage").insert({
          agent_id: payload.agent_id,
          model: payload.model,
          provider: payload.provider,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          total_tokens: tokensIn + tokensOut,
          cost_usd: Number(payload.cost_usd ?? 0),
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
        if (!payload.task_id || !payload.status) {
          return NextResponse.json({ error: "task_id and status are required" }, { status: 400 });
        }
        const update: { status: unknown; description?: string } = { status: payload.status };
        if (typeof payload.description === "string" && payload.description.trim()) {
          update.description = payload.description;
        }
        const { error } = await db.from("sprint_items").update(update).eq("id", payload.task_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

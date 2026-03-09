import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// Auth token that agents must include (simple authentication)
const AGENT_AUTH_TOKEN = process.env.AGENT_AUTH_TOKEN || "agent-log-123";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    
    // Simple auth check
    if (authHeader !== `Bearer ${AGENT_AUTH_TOKEN}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, data } = body;

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    switch (action) {
      case "status": {
        const { agent_id, status, job_id } = data;
        const { error } = await db
          .from("agents")
          .update({ status, last_seen: new Date().toISOString(), current_job_id: job_id || null })
          .eq("id", agent_id);
        
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      case "usage": {
        const { agent_id, model, provider, tokens_in, tokens_out, cost_usd, project_id, job_id } = data;
        const { error } = await db.from("ai_usage").insert({
          agent_id,
          model,
          provider,
          tokens_in,
          tokens_out,
          total_tokens: tokens_in + tokens_out,
          cost_usd,
          project_id,
          job_id,
        });
        
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      case "event": {
        const { agent_id, event_type, project_id, job_id, payload } = data;
        const { error } = await db.from("agent_events").insert({
          agent_id,
          event_type,
          project_id,
          job_id,
          payload,
        });
        
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      case "task_update": {
        const { task_id, status, description } = data;
        const update: { status: string; description?: string } = { status };
        if (description) update.description = description;
        
        const { error } = await db
          .from("sprint_items")
          .update(update)
          .eq("id", task_id);
        
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
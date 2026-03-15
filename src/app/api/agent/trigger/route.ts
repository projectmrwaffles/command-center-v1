import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Agent ID to OpenClaw agent name mapping
 */
const AGENT_MAP: Record<string, string> = {
  "11111111-1111-1111-1111-000000000001": "main",
  "11111111-1111-1111-1111-000000000002": "product-lead",
  "11111111-1111-1111-1111-000000000003": "head-of-design",
  "11111111-1111-1111-1111-000000000004": "product-designer-app",
  "11111111-1111-1111-1111-000000000005": "web-designer-marketing",
  "11111111-1111-1111-1111-000000000006": "tech-lead-architect",
  "11111111-1111-1111-1111-000000000007": "frontend-engineer",
  "11111111-1111-1111-1111-000000000008": "backend-engineer",
  "11111111-1111-1111-1111-000000000009": "mobile-engineer",
  "11111111-1111-1111-1111-000000000010": "seo-web-developer",
  "11111111-1111-1111-1111-000000000011": "growth-lead",
  "11111111-1111-1111-1111-000000000012": "marketing-producer",
  "11111111-1111-1111-1111-000000000013": "marketing-ops-analytics",
  "11111111-1111-1111-1111-000000000014": "qa-auditor",
};

/**
 * Get OpenClaw agent name from database agent ID
 */
export function getAgentNameFromId(agentId: string): string | null {
  return AGENT_MAP[agentId] || null;
}

/**
 * POST /api/agent/trigger
 * 
 * Triggers an agent to start working on a task via Supabase Realtime broadcast.
 * This replaces the old approach of running `openclaw agent` on the server.
 * 
 * Body: {
 *   agentId: string,        // Database agent ID
 *   taskId: string,         // Sprint item ID
 *   projectName: string,    // Project name for context
 *   taskTitle: string,      // Task title
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = authorizeApiRequest(req, { bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { agentId, taskId, projectName, taskTitle } = body;

    if (!agentId || !taskId) {
      return NextResponse.json(
        { error: "agentId and taskId are required" },
        { status: 400 }
      );
    }

    const agentName = getAgentNameFromId(agentId);
    if (!agentName) {
      console.warn(`[Agent Trigger] Unknown agent ID: ${agentId}`);
      return NextResponse.json(
        { error: "Unknown agent ID", agentId },
        { status: 400 }
      );
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Get the project for more context
    const { data: task } = await db
      .from("sprint_items")
      .select("*, projects!inner(name)")
      .eq("id", taskId)
      .single();

    const actualProjectName = projectName || task?.projects?.name || "Unknown Project";
    const actualTaskTitle = taskTitle || task?.title || "New task";

    // Create a notification in the agent_notifications table (if it exists)
    // This serves as a persistent record and can be used for the realtime listener
    const notificationPayload = {
      agent_id: agentId,
      task_id: taskId,
      project_name: actualProjectName,
      task_title: actualTaskTitle,
      message: `New task for project "${actualProjectName}": ${actualTaskTitle}. Start working on this and update the task status to "in_progress" when you begin.`,
      triggered_at: new Date().toISOString(),
      status: "pending",
    };

    // Try to insert into agent_notifications table (optional - may not exist yet)
    // This provides a persistent record of notifications
    try {
      await db.from("agent_notifications").insert({
        agent_id: agentId,
        task_id: taskId,
        project_name: actualProjectName,
        task_title: actualTaskTitle,
        message: notificationPayload.message,
        status: "pending",
      });
    } catch {
      // Table might not exist, that's OK - we still broadcast via realtime
      console.log("[Agent Trigger] agent_notifications table not available, using broadcast only");
    }

    // Use Supabase Realtime broadcast to send notification to the agent
    // The channel is named after the agent to allow targeted delivery
    const channelName = `agent-${agentId}`;
    
    // Send a broadcast message that the listener script will pick up
    await db.channel(channelName).send({
      type: "broadcast",
      event: "agent_work",
      payload: notificationPayload,
    });

    console.log(`[Agent Trigger] Sent notification to agent ${agentName} (${agentId}) for task: ${actualTaskTitle}`);

    return NextResponse.json({
      success: true,
      agent: agentName,
      agentId,
      taskId,
      message: `Notification sent to ${agentName}`,
    });
  } catch (e: unknown) {
    console.error("[API /agent/trigger] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/agent/trigger
 * 
 * Returns the list of mapped agents for reference
 */
export async function GET(req: NextRequest) {
  const auth = authorizeApiRequest(req, { bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    agents: Object.entries(AGENT_MAP).map(([id, name]) => ({
      id,
      name,
    })),
  });
}
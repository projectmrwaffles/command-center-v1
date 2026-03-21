import { createRouteHandlerClient } from "./supabase-server.ts";

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

export function getAgentNameFromId(agentId: string): string {
  return AGENT_MAP[agentId] || "product-lead";
}

export async function triggerAgentWork(
  db: ReturnType<typeof createRouteHandlerClient>,
  agentId: string,
  projectName: string,
  taskTitle: string,
  taskId: string,
): Promise<void> {
  if (!db) return;

  try {
    const agentName = getAgentNameFromId(agentId);
    const message = `New task for project "${projectName}": ${taskTitle}. Start working on this and update the task status to "in_progress" when you begin.`;
    const payload = {
      agent_id: agentId,
      task_id: taskId,
      project_name: projectName,
      task_title: taskTitle,
      message,
      triggered_at: new Date().toISOString(),
      status: "pending",
    };

    try {
      await db.from("agent_notifications").insert({
        agent_id: agentId,
        task_id: taskId,
        project_name: projectName,
        task_title: taskTitle,
        message,
        status: "pending",
      });
    } catch {
      console.log("[Trigger] agent_notifications table not available, using broadcast only");
    }

    await db.channel(`agent-${agentId}`).send({
      type: "broadcast",
      event: "agent_work",
      payload,
    });

    console.log(`[Trigger] Notified agent ${agentName} (${agentId}) for task: ${taskTitle}`);
  } catch (e) {
    console.error(`[Trigger] Failed to trigger agent ${agentId}:`, e);
  }
}

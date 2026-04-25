import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

function firstAbsolutePath(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const trimmed = String(value).trim();
    if (!trimmed) continue;
    if (path.isAbsolute(trimmed)) return trimmed;
  }

  return null;
}

function deriveOpenClawRootFromAbsolutePath(sourcePath: string | null): string | null {
  if (!sourcePath) return null;

  const normalized = path.resolve(sourcePath);
  const marker = `${path.sep}.openclaw`;
  const index = normalized.indexOf(marker);
  if (index >= 0) return normalized.slice(0, index + marker.length);
  if (path.basename(normalized) === ".openclaw") return normalized;
  return null;
}

export function resolveOpenClawRoot(): string {
  const explicitRoot = firstAbsolutePath(process.env.OPENCLAW_ROOT);
  if (explicitRoot) return explicitRoot;

  const homeRoot = firstAbsolutePath(process.env.HOME, os.homedir());
  if (homeRoot) return path.join(homeRoot, ".openclaw");

  const derivedRoot = deriveOpenClawRootFromAbsolutePath(firstAbsolutePath(process.cwd(), __dirname));
  if (derivedRoot) return derivedRoot;

  return path.join(os.tmpdir(), ".openclaw");
}

export function resolveAgentWorkspacePath(agentName: string): string {
  const workspaceDirName = agentName === "main" ? "workspace" : `workspace-${agentName}`;
  return path.join(resolveOpenClawRoot(), workspaceDirName);
}

export async function getAgentWorkspaceBootstrapState(agentId: string): Promise<
  | { ready: true; agentName: string; workspacePath: string }
  | { ready: false; agentName: string; workspacePath: string; bootstrapPath: string; reason: string }
> {
  const agentName = getAgentNameFromId(agentId);
  const workspacePath = resolveAgentWorkspacePath(agentName);
  const bootstrapPath = path.join(workspacePath, "BOOTSTRAP.md");

  try {
    await fs.access(bootstrapPath);
    return {
      ready: false,
      agentName,
      workspacePath,
      bootstrapPath,
      reason: `bootstrap_pending:${agentName}:${bootstrapPath}`,
    };
  } catch {
    return { ready: true, agentName, workspacePath };
  }
}

export async function triggerAgentWork(
  db: ReturnType<typeof createRouteHandlerClient>,
  agentId: string,
  projectName: string,
  taskTitle: string,
  taskId: string,
  projectId?: string | null,
): Promise<{ dispatched: boolean; jobId?: string | null; error?: string | null }> {
  if (!db) return { dispatched: false, error: "db_unavailable" };

  try {
    const readiness = await getAgentWorkspaceBootstrapState(agentId);
    const agentName = readiness.agentName;
    const triggeredAt = new Date().toISOString();

    if (!readiness.ready) {
      const errorMessage = `Agent workspace bootstrap pending for ${agentName}. Complete or remove ${readiness.bootstrapPath} before dispatching work.`;

      try {
        await db.from("agent_events").insert({
          agent_id: agentId,
          project_id: projectId ?? null,
          event_type: "task_dispatch_blocked",
          payload: {
            task_id: taskId,
            title: taskTitle,
            status: "blocked",
            reason: "bootstrap_pending",
            message: errorMessage,
            workspace_path: readiness.workspacePath,
            bootstrap_path: readiness.bootstrapPath,
          },
        });
      } catch {
        // Ignore secondary logging failures.
      }

      return { dispatched: false, error: errorMessage };
    }

    const message = `New task for project "${projectName}": ${taskTitle}. Start working on this and update the task status to "in_progress" when you begin.`;
    const payload = {
      agent_id: agentId,
      task_id: taskId,
      project_id: projectId ?? null,
      project_name: projectName,
      task_title: taskTitle,
      message,
      triggered_at: triggeredAt,
      status: "pending",
    };

    const summary = `task:${taskId}`;
    const existingJob = await db
      .from("jobs")
      .select("id")
      .eq("summary", summary)
      .eq("owner_agent_id", agentId)
      .limit(1)
      .maybeSingle();

    if (existingJob.error) {
      throw new Error(existingJob.error.message);
    }

    let jobId = existingJob.data?.id ?? null;

    if (jobId) {
      const jobUpdate = await db
        .from("jobs")
        .update({
          title: taskTitle,
          status: "queued",
          project_id: projectId ?? null,
          updated_at: triggeredAt,
        })
        .eq("id", jobId)
        .select("id")
        .single();

      if (jobUpdate.error) {
        throw new Error(jobUpdate.error.message);
      }

      jobId = jobUpdate.data?.id ?? jobId;
    } else {
      const jobInsert = await db
        .from("jobs")
        .insert({
          project_id: projectId ?? null,
          owner_agent_id: agentId,
          title: taskTitle,
          status: "queued",
          summary,
        })
        .select("id")
        .single();

      if (jobInsert.error) {
        throw new Error(jobInsert.error.message);
      }

      jobId = jobInsert.data?.id ?? null;
    }

    const eventInsert = await db.from("agent_events").insert({
      agent_id: agentId,
      project_id: projectId ?? null,
      job_id: jobId,
      event_type: "task_dispatched",
      payload: {
        task_id: taskId,
        title: taskTitle,
        status: "queued",
        message: `Dispatched ${taskTitle} to ${agentName}`,
      },
    });

    if (eventInsert.error) {
      throw new Error(eventInsert.error.message);
    }

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
      console.log("[Trigger] agent_notifications table not available, continuing with durable job/event + broadcast");
    }

    await db.channel(`agent-${agentId}`).send({
      type: "broadcast",
      event: "agent_work",
      payload,
    });

    console.log(`[Trigger] Dispatched agent ${agentName} (${agentId}) for task: ${taskTitle}`);
    return { dispatched: true, jobId };
  } catch (e) {
    console.error(`[Trigger] Failed to trigger agent ${agentId}:`, e);
    const errorMessage = e instanceof Error ? e.message : "dispatch_failed";

    try {
      await db.from("agent_events").insert({
        agent_id: agentId,
        project_id: projectId ?? null,
        event_type: "task_dispatch_failed",
        payload: {
          task_id: taskId,
          title: taskTitle,
          error: errorMessage,
        },
      });
    } catch {
      // Ignore secondary logging failures.
    }

    return { dispatched: false, error: errorMessage };
  }
}

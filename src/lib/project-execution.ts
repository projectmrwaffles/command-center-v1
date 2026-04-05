import { triggerAgentWork } from "./agent-dispatch";
import { getProjectArtifactIntegrity } from "./project-artifact-requirements";

type DbClient = { from: (table: string) => any } & Record<string, any>;

type ProjectRow = {
  id: string;
  name?: string | null;
  type?: string | null;
  intake?: any;
  links?: Record<string, string> | null;
  github_repo_binding?: any;
};

type SprintRow = {
  id: string;
  name: string;
  status: string;
  phase_order?: number | null;
  created_at?: string | null;
  approval_gate_required?: boolean | null;
  approval_gate_status?: string | null;
};

type TaskRow = {
  id: string;
  project_id: string;
  sprint_id?: string | null;
  title: string;
  status: string;
  assignee_agent_id?: string | null;
  task_type?: string | null;
  owner_team_id?: string | null;
};

type JobRow = {
  id: string;
  owner_agent_id?: string | null;
  status: string;
  summary?: string | null;
  project_id?: string | null;
  updated_at?: string | null;
};

type AgentRow = {
  id: string;
  status?: string | null;
  current_job_id?: string | null;
};

function sortSprints(a: SprintRow, b: SprintRow) {
  const ao = a.phase_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.phase_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return +new Date(a.created_at || 0) - +new Date(b.created_at || 0);
}

export async function getLeadAgentForTeam(db: DbClient, teamId: string | null | undefined): Promise<string | null> {
  if (!teamId) return null;

  const { data, error } = await db
    .from("team_members")
    .select("agent_id, role")
    .eq("team_id", teamId)
    .order("role", { ascending: true });

  if (error) throw new Error(error.message);

  const leadMember = data?.find((member: { role?: string | null }) => member.role === "lead") || data?.[0];
  return leadMember?.agent_id ?? null;
}

export async function resolveTaskAssignee(db: DbClient, task: Pick<TaskRow, "assignee_agent_id" | "owner_team_id">): Promise<string | null> {
  if (task.assignee_agent_id) return task.assignee_agent_id;
  return getLeadAgentForTeam(db, task.owner_team_id);
}

export function getTaskExecutionBlocker(input: {
  project: ProjectRow;
  task: TaskRow;
  sprint?: SprintRow | null;
  sprints?: SprintRow[];
  jobs?: JobRow[];
  agents?: AgentRow[];
}) {
  const sprints = (input.sprints || []).slice().sort(sortSprints);
  const sprint = input.sprint ?? sprints.find((candidate) => candidate.id === input.task.sprint_id) ?? null;
  const jobs = input.jobs || [];
  const agents = input.agents || [];
  const artifactIntegrity = getProjectArtifactIntegrity(input.project, [input.task]);

  if (!input.task.assignee_agent_id && !input.task.owner_team_id) {
    return {
      key: "waiting_for_owner_assignment",
      label: "Waiting for owner assignment",
      detail: "This work item has no assigned agent or routed owner team yet, so it cannot be dispatched.",
    } as const;
  }

  if (!input.task.assignee_agent_id && input.task.owner_team_id) {
    return {
      key: "waiting_for_owner_assignment",
      label: "Waiting for owner assignment",
      detail: "This work item is routed to a team, but no lead agent is available to dispatch yet.",
    } as const;
  }

  if (artifactIntegrity.pendingProvisioning) {
    return {
      key: "waiting_for_repo",
      label: "Waiting for repo",
      detail: artifactIntegrity.pendingProvisioningReason || "GitHub repo provisioning is still pending for this code-heavy work.",
    } as const;
  }

  if (artifactIntegrity.blockingReason) {
    return {
      key: "waiting_for_repo",
      label: "Waiting for repo",
      detail: artifactIntegrity.blockingReason,
    } as const;
  }

  if (sprint?.approval_gate_required && sprint.approval_gate_status && sprint.approval_gate_status !== "approved" && sprint.approval_gate_status !== "not_requested") {
    return {
      key: "waiting_for_approval",
      label: "Waiting for approval",
      detail: `${sprint.name} is gated by approval (${sprint.approval_gate_status.replace(/_/g, " ")}), so execution cannot start yet.`,
    } as const;
  }

  const sprintIndex = sprint ? sprints.findIndex((candidate) => candidate.id === sprint.id) : -1;
  if (sprint && sprintIndex > 0) {
    const earlierBlockingSprint = sprints
      .slice(0, sprintIndex)
      .find((candidate) => candidate.status !== "completed" && candidate.status !== "archived");

    if (earlierBlockingSprint) {
      return {
        key: "waiting_for_kickoff_completion",
        label: "Waiting for kickoff completion",
        detail: `${input.task.title} is in ${sprint.name}, but ${earlierBlockingSprint.name} must finish before this phase can start.`,
      } as const;
    }
  }

  if (sprint && sprint.status !== "active") {
    return {
      key: "waiting_for_kickoff_completion",
      label: "Waiting for kickoff completion",
      detail: `${input.task.title} is queued in ${sprint.name}, but that phase is still ${sprint.status.replace(/_/g, " ")}.`,
    } as const;
  }

  const matchingJob = jobs.find((job) => job.summary === `task:${input.task.id}`);
  if (matchingJob?.status === "blocked") {
    return {
      key: "dispatch_failed_retrying",
      label: "Dispatch failed / retrying",
      detail: `${input.task.title} has a blocked job record, so dispatch needs attention before execution can continue.`,
    } as const;
  }

  const conflictingJob = jobs.find((job) =>
    job.owner_agent_id === input.task.assignee_agent_id
      && job.summary !== `task:${input.task.id}`
      && (job.status === "queued" || job.status === "in_progress")
  );
  const assignedAgent = agents.find((agent) => agent.id === input.task.assignee_agent_id);
  const agentActivelyOccupied = Boolean(
    conflictingJob
    && assignedAgent
    && assignedAgent.status === "active"
    && assignedAgent.current_job_id
    && assignedAgent.current_job_id === conflictingJob.id
  );

  if (conflictingJob && agentActivelyOccupied) {
    return {
      key: "waiting_for_worker_capacity",
      label: "Waiting for worker capacity",
      detail: "The assigned agent already has active queued or running work, so this task is waiting for capacity.",
    } as const;
  }

  return null;
}

export async function dispatchEligibleProjectTasks(db: DbClient, input: {
  project: ProjectRow;
  tasks: TaskRow[];
  sprints: SprintRow[];
  jobs?: JobRow[];
  agents?: AgentRow[];
}) {
  const jobs = input.jobs || [];
  const agents = input.agents || [];
  const results: Array<{ taskId: string; dispatched: boolean; blocker?: ReturnType<typeof getTaskExecutionBlocker> | null; reason?: string | null }> = [];

  for (const rawTask of input.tasks) {
    if (rawTask.status !== "todo") continue;

    const assigneeAgentId = await resolveTaskAssignee(db, rawTask);
    let task = rawTask;

    if (!rawTask.assignee_agent_id && assigneeAgentId) {
      const { data: updatedTask, error } = await db
        .from("sprint_items")
        .update({ assignee_agent_id: assigneeAgentId, updated_at: new Date().toISOString() })
        .eq("id", rawTask.id)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      task = updatedTask as TaskRow;
    } else if (assigneeAgentId && rawTask.assignee_agent_id !== assigneeAgentId) {
      task = { ...rawTask, assignee_agent_id: assigneeAgentId };
    }

    const blocker = getTaskExecutionBlocker({
      project: input.project,
      task,
      sprint: input.sprints.find((sprint) => sprint.id === task.sprint_id) ?? null,
      sprints: input.sprints,
      jobs,
      agents,
    });

    if (blocker) {
      results.push({ taskId: task.id, dispatched: false, blocker, reason: blocker.key });
      continue;
    }

    const dispatch = await triggerAgentWork(
      db as any,
      task.assignee_agent_id as string,
      input.project.name || "Unknown Project",
      task.title,
      task.id,
      task.project_id,
    );

    results.push({ taskId: task.id, dispatched: dispatch.dispatched, reason: dispatch.error || null });
  }

  return results;
}

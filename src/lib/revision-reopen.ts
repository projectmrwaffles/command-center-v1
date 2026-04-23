import { dispatchEligibleProjectTasks } from "./project-execution.ts";
import { selectProjectWithArtifactCompat } from "./project-db-compat.ts";

type DbClient = { from: (table: string) => any } & Record<string, any>;

type SprintRow = {
  id: string;
  project_id: string;
  status: string | null;
  phase_order?: number | null;
  created_at?: string | null;
};

function sortSprints(a: SprintRow, b: SprintRow) {
  const ao = a.phase_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.phase_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return +new Date(a.created_at || 0) - +new Date(b.created_at || 0);
}

export async function reopenProjectSprintForRevision(db: DbClient, input: {
  projectId: string;
  sprintId: string;
  now?: string;
}) {
  const now = input.now || new Date().toISOString();
  const { data: sprints, error } = await db
    .from("sprints")
    .select("id, project_id, status, phase_order, created_at")
    .eq("project_id", input.projectId);

  if (error) throw new Error(error.message || "Failed to load project sprints for revision reopen");

  const ordered = ((sprints || []) as SprintRow[]).slice().sort(sortSprints);
  const targetIndex = ordered.findIndex((sprint) => sprint.id === input.sprintId);
  if (targetIndex === -1) throw new Error("Milestone not found while reopening revision work");

  const targetSprint = ordered[targetIndex];
  const laterSprintIds = ordered.slice(targetIndex + 1).map((sprint) => sprint.id).filter(Boolean);

  const projectUpdate = await db
    .from("projects")
    .update({ status: "active", updated_at: now })
    .eq("id", input.projectId);
  if (projectUpdate.error) throw new Error(projectUpdate.error.message || "Failed to reactivate project for revision work");

  const targetUpdate = await db
    .from("sprints")
    .update({ status: "active", updated_at: now })
    .eq("id", input.sprintId)
    .eq("project_id", input.projectId);
  if (targetUpdate.error) throw new Error(targetUpdate.error.message || "Failed to reactivate milestone for revision work");

  if (laterSprintIds.length > 0) {
    const laterUpdate = await db
      .from("sprints")
      .update({ status: "draft", updated_at: now })
      .eq("project_id", input.projectId)
      .in("id", laterSprintIds);
    if (laterUpdate.error) throw new Error(laterUpdate.error.message || "Failed to reset downstream milestones for revision work");
  }

  return {
    reopenedProject: true,
    reopenedSprintId: input.sprintId,
    resetSprintIds: laterSprintIds,
  };
}

export async function redispatchReopenedSprintTasks(db: DbClient, input: {
  projectId: string;
  sprintId: string;
}) {
  const [{ data: project, error: projectError }, { data: sprints, error: sprintsError }, { data: tasks, error: tasksError }, { data: jobs, error: jobsError }, { data: agents, error: agentsError }] = await Promise.all([
    selectProjectWithArtifactCompat(db, input.projectId, "id, name, type, intake"),
    db.from("sprints").select("id, name, status, phase_order, created_at, phase_key, approval_gate_required, approval_gate_status, delivery_review_required, delivery_review_status").eq("project_id", input.projectId),
    db.from("sprint_items").select("id, project_id, sprint_id, title, status, assignee_agent_id, task_type, owner_team_id").eq("project_id", input.projectId).eq("sprint_id", input.sprintId),
    db.from("jobs").select("id, owner_agent_id, project_id, status, summary, updated_at").eq("project_id", input.projectId).in("status", ["queued", "in_progress", "blocked"]),
    db.from("agents").select("id, status, current_job_id").not("name", "like", "_archived_%"),
  ]);

  if (projectError || !project) throw new Error(projectError?.message || "Failed to load reopened project context");
  if (sprintsError) throw new Error(sprintsError.message || "Failed to load sprint context for reopen dispatch");
  if (tasksError) throw new Error(tasksError.message || "Failed to load task context for reopen dispatch");
  if (jobsError) throw new Error(jobsError.message || "Failed to load job context for reopen dispatch");
  if (agentsError) throw new Error(agentsError.message || "Failed to load agent context for reopen dispatch");

  const sprintTasks = ((tasks || []) as Array<Record<string, any>>).filter((task) => task.status === "todo");
  if (sprintTasks.length === 0) return [];

  return dispatchEligibleProjectTasks(db as any, {
    project: project as any,
    tasks: sprintTasks as any,
    sprints: (sprints || []) as any,
    jobs: (jobs || []) as any,
    agents: (agents || []) as any,
  });
}

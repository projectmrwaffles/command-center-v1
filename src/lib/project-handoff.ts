import { dispatchEligibleProjectTasks } from "./project-execution.ts";
import { getProjectArtifactIntegrity } from "./project-artifact-requirements.ts";
import { selectProjectWithArtifactCompat } from "./project-db-compat.ts";

type DbClient = { from: (table: string) => any } & Record<string, any>;

type SprintRow = {
  id: string;
  name: string;
  status: string;
  created_at?: string | null;
  phase_order?: number | null;
  approval_gate_required?: boolean | null;
  approval_gate_status?: string | null;
};

type TaskRow = {
  id: string;
  project_id: string;
  sprint_id: string | null;
  title: string;
  status: string;
  assignee_agent_id: string | null;
  position?: number | null;
  task_type?: string | null;
};

type ProjectRow = {
  name?: string | null;
  type?: string | null;
  intake?: any;
  links?: Record<string, string> | null;
  github_repo_binding?: any;
};

const DONE_LIKE = new Set(["done", "cancelled"]);
const ACTIVE_LIKE = new Set(["todo", "in_progress", "blocked"]);

function sortSprints(a: SprintRow, b: SprintRow) {
  const ao = a.phase_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.phase_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return +new Date(a.created_at || 0) - +new Date(b.created_at || 0);
}

async function loadProjectProgressionContext(db: DbClient, projectId: string) {
  const [{ data: sprints, error: sprintsError }, { data: tasks, error: tasksError }, { data: project, error: projectError }] = await Promise.all([
    db.from("sprints").select("*").eq("project_id", projectId),
    db.from("sprint_items").select("*").eq("project_id", projectId),
    selectProjectWithArtifactCompat(db, projectId, "name, type, intake, links, github_repo_binding"),
  ]);

  if (sprintsError) throw new Error(sprintsError.message);
  if (tasksError) throw new Error(tasksError.message);
  if (projectError) throw new Error(projectError.message);

  return {
    project: (project || {}) as ProjectRow,
    sprintRows: ((sprints || []) as SprintRow[]).slice().sort(sortSprints),
    taskRows: ((tasks || []) as TaskRow[]).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  };
}

function getSprintCompletionState(project: ProjectRow, sprint: SprintRow, taskRows: TaskRow[]) {
  const sprintTasks = taskRows.filter((task) => task.sprint_id === sprint.id);
  const sprintStillActive = sprintTasks.some((task) => ACTIVE_LIKE.has(task.status));
  const sprintComplete = sprintTasks.length > 0 && sprintTasks.every((task) => DONE_LIKE.has(task.status));
  const artifactIntegrity = getProjectArtifactIntegrity(project || {}, sprintTasks);
  const gateBlocked = Boolean(sprint.approval_gate_required && sprint.approval_gate_status !== "approved");

  return {
    sprintTasks,
    sprintStillActive,
    sprintComplete,
    artifactIntegrity,
    gateBlocked,
  };
}

async function dispatchSprintTodoTasks(db: DbClient, sprint: SprintRow, taskRows: TaskRow[], project: ProjectRow, sprintRows: SprintRow[]) {
  const nextTasks = taskRows.filter((task) => task.sprint_id === sprint.id && task.status === "todo");
  if (!nextTasks.length) return [];

  const [{ data: jobs }, { data: agents }] = await Promise.all([
    db.from("jobs").select("id, owner_agent_id, project_id, status, summary, updated_at").eq("project_id", nextTasks[0].project_id).in("status", ["queued", "in_progress", "blocked"]),
    db.from("agents").select("id, status, current_job_id").not("name", "like", "_archived_%"),
  ]);

  const results = await dispatchEligibleProjectTasks(db as any, {
    project: { id: nextTasks[0].project_id, ...project },
    tasks: nextTasks as any,
    sprints: sprintRows as any,
    jobs: (jobs ?? []) as any,
    agents: (agents ?? []) as any,
  });

  return results.filter((result) => result.dispatched).map((result) => result.taskId);
}

async function completeSprint(db: DbClient, sprint: SprintRow) {
  if (sprint.status === "completed") return;

  const currentUpdate = await db.from("sprints").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", sprint.id);
  if (currentUpdate.error) throw new Error(currentUpdate.error.message);
  sprint.status = "completed";
}

export async function reconcileProjectPhaseProgression(db: DbClient, input: {
  projectId: string;
  projectName?: string | null;
  completedTaskId?: string;
}) {
  const { project, sprintRows, taskRows } = await loadProjectProgressionContext(db, input.projectId);
  const advancedTransitions: Array<{ previousSprintId: string; nextSprintId: string; dispatchedTaskIds: string[] }> = [];

  for (let index = 0; index < sprintRows.length; index += 1) {
    const currentSprint = sprintRows[index];
    if (currentSprint.status === "completed" || currentSprint.status === "archived") continue;

    const state = getSprintCompletionState(project, currentSprint, taskRows);
    if (state.sprintStillActive || !state.sprintComplete) break;
    if (state.artifactIntegrity.blockingReason) {
      return { advanced: false, reason: "required_artifacts_missing", advancedTransitions };
    }
    if (state.gateBlocked) {
      return { advanced: false, reason: "review_gate_not_approved", advancedTransitions };
    }

    const nextSprint = sprintRows.slice(index + 1).find((sprint) => sprint.status !== "completed" && sprint.status !== "archived");
    if (!nextSprint) {
      await completeSprint(db, currentSprint);
      break;
    }

    await completeSprint(db, currentSprint);

    if (nextSprint.status !== "active") {
      const nextUpdate = await db.from("sprints").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", nextSprint.id);
      if (nextUpdate.error) throw new Error(nextUpdate.error.message);
      nextSprint.status = "active";
    }

    const dispatchedTaskIds = await dispatchSprintTodoTasks(db, nextSprint, taskRows, project, sprintRows);
    advancedTransitions.push({ previousSprintId: currentSprint.id, nextSprintId: nextSprint.id, dispatchedTaskIds });

    await db.from("agent_events").insert({
      agent_id: null,
      project_id: input.projectId,
      event_type: "project_phase_advanced",
      payload: {
        completed_task_id: input.completedTaskId ?? null,
        previous_sprint_id: currentSprint.id,
        previous_sprint_name: currentSprint.name,
        next_sprint_id: nextSprint.id,
        next_sprint_name: nextSprint.name,
        dispatched_task_ids: dispatchedTaskIds,
        reconciliation: input.completedTaskId ? "task_completion" : "project_state_reconcile",
      },
    });

    break;
  }

  if (advancedTransitions.length === 0) {
    if (input.completedTaskId) {
      const completedTask = taskRows.find((task) => task.id === input.completedTaskId);
      if (!completedTask?.sprint_id) return { advanced: false, reason: "completed_task_has_no_sprint", advancedTransitions };
      const currentSprint = sprintRows.find((sprint) => sprint.id === completedTask.sprint_id);
      if (!currentSprint) return { advanced: false, reason: "current_sprint_not_found", advancedTransitions };
      const state = getSprintCompletionState(project, currentSprint, taskRows);
      if (state.sprintStillActive) return { advanced: false, reason: "current_sprint_still_has_active_tasks", advancedTransitions };
      if (!state.sprintComplete) return { advanced: false, reason: "current_sprint_not_complete", advancedTransitions };
      const nextSprint = sprintRows.slice(sprintRows.findIndex((sprint) => sprint.id === currentSprint.id) + 1).find((sprint) => sprint.status !== "completed" && sprint.status !== "archived");
      if (!nextSprint) {
        await completeSprint(db, currentSprint);
        return { advanced: false, reason: "final_sprint_completed", advancedTransitions };
      }
    }
    return { advanced: false, reason: "no_phase_change_needed", advancedTransitions };
  }

  const latestTransition = advancedTransitions[advancedTransitions.length - 1];
  return {
    advanced: true,
    previousSprintId: latestTransition.previousSprintId,
    nextSprintId: latestTransition.nextSprintId,
    dispatchedTaskIds: latestTransition.dispatchedTaskIds,
    advancedTransitions,
  };
}

export async function maybeAdvanceProjectAfterTaskDone(db: DbClient, input: {
  projectId: string;
  completedTaskId: string;
  projectName?: string | null;
}) {
  return reconcileProjectPhaseProgression(db, input);
}

import { triggerAgentWork } from "@/lib/agent-dispatch";

type DbClient = { from: (table: string) => any } & Record<string, any>;

type SprintRow = {
  id: string;
  name: string;
  status: string;
  created_at?: string | null;
  phase_order?: number | null;
};

type TaskRow = {
  id: string;
  sprint_id: string | null;
  title: string;
  status: string;
  assignee_agent_id: string | null;
  position?: number | null;
};

const DONE_LIKE = new Set(["done", "cancelled"]);
const ACTIVE_LIKE = new Set(["todo", "in_progress", "blocked"]);

function sortSprints(a: SprintRow, b: SprintRow) {
  const ao = a.phase_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.phase_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return +new Date(a.created_at || 0) - +new Date(b.created_at || 0);
}

export async function maybeAdvanceProjectAfterTaskDone(db: DbClient, input: {
  projectId: string;
  completedTaskId: string;
  projectName?: string | null;
}) {
  const [{ data: sprints, error: sprintsError }, { data: tasks, error: tasksError }] = await Promise.all([
    db.from("sprints").select("*").eq("project_id", input.projectId),
    db.from("sprint_items").select("*").eq("project_id", input.projectId),
  ]);

  if (sprintsError) throw new Error(sprintsError.message);
  if (tasksError) throw new Error(tasksError.message);

  const sprintRows = ((sprints || []) as SprintRow[]).slice().sort(sortSprints);
  const taskRows = ((tasks || []) as TaskRow[]).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const completedTask = taskRows.find((task) => task.id === input.completedTaskId);
  if (!completedTask?.sprint_id) {
    return { advanced: false, reason: "completed_task_has_no_sprint" };
  }

  const currentSprint = sprintRows.find((sprint) => sprint.id === completedTask.sprint_id);
  if (!currentSprint) {
    return { advanced: false, reason: "current_sprint_not_found" };
  }

  const currentSprintTasks = taskRows.filter((task) => task.sprint_id === currentSprint.id);
  const currentSprintStillActive = currentSprintTasks.some((task) => ACTIVE_LIKE.has(task.status));
  if (currentSprintStillActive) {
    return { advanced: false, reason: "current_sprint_still_has_active_tasks" };
  }

  const currentSprintComplete = currentSprintTasks.length > 0 && currentSprintTasks.every((task) => DONE_LIKE.has(task.status));
  if (!currentSprintComplete) {
    return { advanced: false, reason: "current_sprint_not_complete" };
  }

  const currentIndex = sprintRows.findIndex((sprint) => sprint.id === currentSprint.id);
  const nextSprint = sprintRows.slice(currentIndex + 1).find((sprint) => sprint.status !== "completed" && sprint.status !== "archived");
  if (!nextSprint) {
    return { advanced: false, reason: "no_next_sprint" };
  }

  if (currentSprint.status !== "completed") {
    const currentUpdate = await db.from("sprints").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", currentSprint.id);
    if (currentUpdate.error) throw new Error(currentUpdate.error.message);
  }

  if (nextSprint.status !== "active") {
    const nextUpdate = await db.from("sprints").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", nextSprint.id);
    if (nextUpdate.error) throw new Error(nextUpdate.error.message);
  }

  const nextTasks = taskRows.filter((task) => task.sprint_id === nextSprint.id && task.status === "todo" && task.assignee_agent_id);
  const projectName = input.projectName || (await db.from("projects").select("name").eq("id", input.projectId).single()).data?.name || "Unknown Project";

  for (const task of nextTasks) {
    await triggerAgentWork(db as any, task.assignee_agent_id as string, projectName, task.title, task.id);
  }

  await db.from("agent_events").insert({
    agent_id: null,
    project_id: input.projectId,
    event_type: "project_phase_advanced",
    payload: {
      completed_task_id: input.completedTaskId,
      previous_sprint_id: currentSprint.id,
      previous_sprint_name: currentSprint.name,
      next_sprint_id: nextSprint.id,
      next_sprint_name: nextSprint.name,
      dispatched_task_ids: nextTasks.map((task) => task.id),
    },
  });

  return {
    advanced: true,
    previousSprintId: currentSprint.id,
    nextSprintId: nextSprint.id,
    dispatchedTaskIds: nextTasks.map((task) => task.id),
  };
}

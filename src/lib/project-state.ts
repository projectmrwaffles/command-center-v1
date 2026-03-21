import { getProjectArtifactIntegrity } from "./project-artifact-requirements.ts";
import { selectProjectWithArtifactCompat } from "./project-db-compat";

type DbClient = {
  from: (table: string) => any;
};

const TERMINAL_PROJECT_STATUSES = new Set(["completed", "archived"]);
const ACTIVE_TASK_STATUSES = new Set(["todo", "in_progress", "blocked"]);
const VALID_TASK_STATUSES = new Set(["todo", "in_progress", "done", "blocked", "cancelled"]);

export function isValidTaskStatus(status: unknown): status is string {
  return typeof status === "string" && VALID_TASK_STATUSES.has(status);
}

export function normalizeTaskPatch(input: { status?: unknown; notes?: unknown; title?: unknown }) {
  const updateData: Record<string, string> = {};

  if (input.status !== undefined) {
    if (!isValidTaskStatus(input.status)) {
      throw new Error("Invalid task status");
    }
    updateData.status = input.status;
  }

  if (input.notes !== undefined) {
    if (typeof input.notes !== "string") {
      throw new Error("notes must be a string");
    }
    updateData.description = input.notes.trim();
  }

  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim()) {
      throw new Error("title must be a non-empty string");
    }
    updateData.title = input.title.trim();
  }

  return updateData;
}

export async function getProjectTaskPosition(db: DbClient, projectId: string): Promise<number> {
  const { data, error } = await db
    .from("sprint_items")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const highestPosition = data?.[0]?.position ?? 0;
  return highestPosition + 1;
}

export async function ensureDefaultSprint(db: DbClient, projectId: string): Promise<string> {
  const { data: existingSprint, error: existingSprintError } = await db
    .from("sprints")
    .select("id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingSprintError) {
    throw new Error(existingSprintError.message);
  }

  if (existingSprint?.id) {
    return existingSprint.id;
  }

  const today = new Date();
  const end = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: sprint, error: sprintError } = await db
    .from("sprints")
    .insert({
      project_id: projectId,
      name: "Kickoff",
      goal: "Initial delivery setup and routing",
      start_date: today.toISOString().split("T")[0],
      end_date: end.toISOString().split("T")[0],
      status: "active",
    })
    .select("id")
    .single();

  if (sprintError || !sprint?.id) {
    throw new Error(sprintError?.message || "Failed to create kickoff sprint");
  }

  return sprint.id;
}

export async function syncProjectState(db: DbClient, projectId: string): Promise<{
  totalTasks: number;
  doneTasks: number;
  progressPct: number;
  projectStatus?: string;
}> {
  const { data: tasks, error: tasksError } = await db
    .from("sprint_items")
    .select("status")
    .eq("project_id", projectId);

  if (tasksError) {
    throw new Error(tasksError.message);
  }

  const totalTasks = tasks?.length ?? 0;
  const doneTasks = tasks?.filter((task: { status: string }) => task.status === "done").length ?? 0;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const { data: project, error: projectError } = await selectProjectWithArtifactCompat(
    db,
    projectId,
    "status, type, intake"
  );

  if (projectError) {
    throw new Error(projectError.message);
  }

  const hasActiveTasks = tasks?.some((task: { status: string }) => ACTIVE_TASK_STATUSES.has(task.status)) ?? false;
  const artifactIntegrity = getProjectArtifactIntegrity(project || {}, tasks || []);
  const effectiveProgressPct =
    totalTasks > 0 && doneTasks === totalTasks && artifactIntegrity.completionCapPct != null
      ? Math.min(progressPct, artifactIntegrity.completionCapPct)
      : progressPct;
  let nextStatus = project?.status as string | undefined;

  if (totalTasks > 0 && doneTasks === totalTasks && !artifactIntegrity.completionBlocked) {
    nextStatus = "completed";
  } else if (nextStatus === "completed" && (hasActiveTasks || artifactIntegrity.completionBlocked)) {
    nextStatus = "active";
  }

  const updatePayload: Record<string, unknown> = {
    progress_pct: effectiveProgressPct,
    updated_at: new Date().toISOString(),
  };

  const shouldUpdateStatus =
    project?.status !== "archived" &&
    !!nextStatus &&
    (nextStatus === "active" || !TERMINAL_PROJECT_STATUSES.has(project?.status));

  if (shouldUpdateStatus) {
    updatePayload.status = nextStatus;
  }

  const { error: updateError } = await db
    .from("projects")
    .update(updatePayload)
    .eq("id", projectId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    totalTasks,
    doneTasks,
    progressPct: effectiveProgressPct,
    projectStatus: updatePayload.status as string | undefined,
  };
}

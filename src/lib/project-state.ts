import { getProgressTaskSlice } from "./project-bootstrap.ts";
import { getProjectArtifactIntegrity } from "./project-artifact-requirements.ts";
import { selectProjectWithArtifactCompat } from "./project-db-compat.ts";
import { reconcileProjectPhaseProgression } from "./project-handoff.ts";

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
  const [{ data: tasks, error: tasksError }, { data: sprints, error: sprintsError }] = await Promise.all([
    db
      .from("sprint_items")
      .select("status, task_metadata, sprint_id, task_type")
      .eq("project_id", projectId),
    db
      .from("sprints")
      .select("id, status, phase_key, delivery_review_required, delivery_review_status")
      .eq("project_id", projectId),
  ]);

  if (tasksError) {
    throw new Error(tasksError.message);
  }
  if (sprintsError) {
    throw new Error(sprintsError.message);
  }

  const sprintRows = sprints || [];
  const taskRows = tasks || [];
  const validateSprintIds = new Set(
    sprintRows
      .filter((sprint: any) => sprint?.phase_key === "validate")
      .map((sprint: any) => sprint.id)
      .filter(Boolean)
  );
  const validateTasks = taskRows.filter((task: any) => task.sprint_id && validateSprintIds.has(task.sprint_id));
  const validatePhaseAccepted = validateSprintIds.size > 0
    && validateTasks.length > 0
    && validateTasks.every((task: any) => task.status === "done" || task.status === "cancelled")
    && sprintRows
      .filter((sprint: any) => sprint?.phase_key === "validate")
      .every((sprint: any) => sprint.status === "completed" || sprint.status === "archived");

  const buildSprintsNeedingHeal = sprintRows.filter((sprint: any) => {
    const isBuildSprint = sprint?.phase_key === "build";
    const deliveryReviewRequired = sprint?.delivery_review_required === true || isBuildSprint;
    const deliveryReviewStatus = sprint?.delivery_review_status ?? "not_requested";
    const sprintTasks = taskRows.filter((task: any) => task.sprint_id === sprint.id);
    const sprintComplete = sprint?.status === "completed" || sprint?.status === "archived";
    const sprintTasksComplete = sprintTasks.length > 0 && sprintTasks.every((task: any) => task.status === "done" || task.status === "cancelled");
    return validatePhaseAccepted && deliveryReviewRequired && deliveryReviewStatus !== "approved" && sprintComplete && sprintTasksComplete;
  });

  if (buildSprintsNeedingHeal.length > 0) {
    const { error: healError } = await db
      .from("sprints")
      .update({ delivery_review_required: true, delivery_review_status: "approved", updated_at: new Date().toISOString() })
      .in("id", buildSprintsNeedingHeal.map((sprint: any) => sprint.id));

    if (healError) {
      throw new Error(healError.message || "Failed to heal delivery review state after validate completion");
    }

    for (const sprint of buildSprintsNeedingHeal) {
      sprint.delivery_review_required = true;
      sprint.delivery_review_status = "approved";
    }
  }

  const pendingDeliveryReview = sprintRows.some((sprint: any) => {
    const isBuildSprint = sprint?.phase_key === "build";
    const deliveryReviewRequired = sprint?.delivery_review_required === true || isBuildSprint;
    const deliveryReviewStatus = sprint?.delivery_review_status ?? "not_requested";
    return deliveryReviewRequired && deliveryReviewStatus !== "approved";
  });

  const progressTasks = getProgressTaskSlice(taskRows as Array<{ status: string; task_metadata?: Record<string, unknown> | null }>);
  const totalTasks = progressTasks.length;
  const doneTasks = progressTasks.filter((task: { status: string }) => task.status === "done").length;
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

  if (totalTasks > 0 && doneTasks === totalTasks && !artifactIntegrity.completionBlocked && !pendingDeliveryReview) {
    nextStatus = "completed";
  } else if (nextStatus === "completed" && (hasActiveTasks || artifactIntegrity.completionBlocked || pendingDeliveryReview)) {
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

  await reconcileProjectPhaseProgression(db as any, { projectId });

  return {
    totalTasks,
    doneTasks,
    progressPct: effectiveProgressPct,
    projectStatus: updatePayload.status as string | undefined,
  };
}

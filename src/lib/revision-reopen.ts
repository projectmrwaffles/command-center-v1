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

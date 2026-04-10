import { reconcileProjectPhaseProgression } from "./project-handoff.ts";

type DbClient = { from: (table: string) => any } & Record<string, any>;

export async function finalizeCheckpointApproval(db: DbClient, input: {
  projectId: string;
  milestoneId: string;
  decidedAt?: string;
}) {
  const now = input.decidedAt || new Date().toISOString();

  const sprintUpdate = await db
    .from("sprints")
    .update({ approval_gate_status: "approved", updated_at: now })
    .eq("id", input.milestoneId)
    .eq("project_id", input.projectId);

  if (sprintUpdate?.error) {
    throw new Error(sprintUpdate.error.message || "Failed to approve checkpoint gate");
  }

  const reviewTaskUpdate = await db
    .from("sprint_items")
    .update({ review_status: "approved", status: "done", updated_at: now })
    .eq("project_id", input.projectId)
    .eq("sprint_id", input.milestoneId)
    .eq("review_required", true);

  if (reviewTaskUpdate?.error) {
    throw new Error(reviewTaskUpdate.error.message || "Failed to resolve review tasks");
  }

  const progression = await reconcileProjectPhaseProgression(db, {
    projectId: input.projectId,
  });

  return {
    ok: true,
    decidedAt: now,
    progression,
  };
}

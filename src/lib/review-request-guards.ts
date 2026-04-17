type SprintReviewGuardInput = {
  approvalGateRequired?: boolean | null;
  approvalGateStatus?: string | null;
  deliveryReviewRequired?: boolean | null;
  deliveryReviewStatus?: string | null;
  checkpointType?: string | null;
  phaseKey?: string | null;
  taskStatuses?: Array<string | null | undefined> | null;
};

export type SprintReviewEligibility =
  | { ok: true; totalTasks: number; doneTasks: number }
  | { ok: false; reason: string; totalTasks: number; doneTasks: number };

const DONE_LIKE = new Set(["done", "cancelled"]);
const ACTIVE_REVIEW_BLOCKERS = new Set(["todo", "in_progress", "blocked"]);

export function resolveSprintReviewSurface(input: Omit<SprintReviewGuardInput, "taskStatuses">) {
  const checkpointType = typeof input.checkpointType === "string" ? input.checkpointType : null;
  const phaseKey = typeof input.phaseKey === "string" ? input.phaseKey : null;
  const isDeliveryReview = checkpointType === "delivery_review" || (!checkpointType && phaseKey === "build" && input.deliveryReviewStatus != null);

  return isDeliveryReview
    ? {
        reviewKind: "delivery_review" as const,
        required: input.deliveryReviewRequired ?? phaseKey === "build",
        status: input.deliveryReviewStatus ?? "not_requested",
      }
    : {
        reviewKind: "approval_gate" as const,
        required: input.approvalGateRequired ?? false,
        status: input.approvalGateStatus ?? "not_requested",
      };
}

export function getSprintReviewEligibility(input: SprintReviewGuardInput): SprintReviewEligibility {
  const taskStatuses = (input.taskStatuses || []).filter((status): status is string => typeof status === "string");
  const totalTasks = taskStatuses.length;
  const doneTasks = taskStatuses.filter((status) => DONE_LIKE.has(status)).length;
  const reviewSurface = resolveSprintReviewSurface(input);

  if (!reviewSurface.required) {
    return { ok: false, reason: "Milestone is not review-gated", totalTasks, doneTasks };
  }

  if (reviewSurface.status === "pending") {
    return { ok: false, reason: "Review request already pending for this milestone", totalTasks, doneTasks };
  }

  if (reviewSurface.status === "approved") {
    return { ok: false, reason: "Milestone has already been approved", totalTasks, doneTasks };
  }

  if (totalTasks === 0) {
    return { ok: false, reason: "Milestone needs at least one task before requesting review", totalTasks, doneTasks };
  }

  if (taskStatuses.some((status) => ACTIVE_REVIEW_BLOCKERS.has(status))) {
    return { ok: false, reason: "Finish milestone tasks before requesting review", totalTasks, doneTasks };
  }

  if (doneTasks !== totalTasks) {
    return { ok: false, reason: "Milestone is not complete enough for review", totalTasks, doneTasks };
  }

  return { ok: true, totalTasks, doneTasks };
}

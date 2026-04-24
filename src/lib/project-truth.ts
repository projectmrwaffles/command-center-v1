import { getBootstrapSprintIds, isBootstrapTask, matchesBootstrapTruth } from "./project-bootstrap.ts";
import { getTaskExecutionBlocker } from "./project-execution.ts";
import { deriveFirstPassQcState } from "./review-checkpoint-state.ts";
import { isStaleExecutionTimestamp } from "@/components/ui/execution-visibility";

export type TruthTaskLike = {
  id?: string | null;
  sprint_id?: string | null;
  title?: string | null;
  task_type?: string | null;
  status?: string | null;
  updated_at?: string | null;
  review_required?: boolean | null;
  review_status?: string | null;
  task_metadata?: Record<string, unknown> | null;
};

export type TruthSprintLike = {
  id: string;
  name?: string | null;
  auto_generated?: boolean | null;
  phase_key?: string | null;
  status?: string | null;
  approval_gate_required?: boolean | null;
  approval_gate_status?: string | null;
  delivery_review_required?: boolean | null;
  delivery_review_status?: string | null;
  reviewRequest?: {
    id?: string | null;
    jobId?: string | null;
    status?: string | null;
  } | null;
  reviewSummary?: {
    latestSubmissionId?: string | null;
    latestSubmissionStatus?: string | null;
    proofItemCount?: number | null;
    proofCompletenessStatus?: string | null;
    feedbackItemCount?: number | null;
    checkpointType?: string | null;
    latestDecision?: string | null;
    latestDecisionNotes?: string | null;
    latestRejectionComment?: string | null;
    latestSubmissionSummary?: string | null;
  } | null;
  preBuildCheckpoint?: {
    outcome?: "match" | "mismatch" | "manual_review" | null;
    status?: "approved" | "pending" | "not_requested" | null;
    reasons?: string[] | null;
  } | null;
};

type StuckWorkflowGuardrail = {
  activeSprintId: string;
  activeSprintName: string;
  nextSprintId: string;
  nextSprintName: string;
  reason: "phase_complete_not_advanced";
  detail: string;
};

function isRunningStatus(status?: string | null) {
  return status === "in_progress" || status === "review";
}

function isQueuedStatus(status?: string | null) {
  return status === "todo";
}

function isDoneStatus(status?: string | null) {
  return status === "done";
}

function isBlockedStatus(status?: string | null) {
  return status === "blocked";
}

function isQueuedTaskBlocker(blocker: ReturnType<typeof getTaskExecutionBlocker>) {
  return blocker?.key === "waiting_for_kickoff_completion"
    || blocker?.key === "waiting_for_worker_capacity";
}

function getSprintFirstPassQcState(sprint?: TruthSprintLike | null) {
  if (!sprint) return null;
  return deriveFirstPassQcState({
    approvalGateStatus: sprint.delivery_review_status,
    reviewSummary: sprint.reviewSummary,
    reviewRequest: sprint.reviewRequest,
    preBuildCheckpoint: sprint.preBuildCheckpoint,
  });
}

function isTaskInActiveCheckpointReview(task: TruthTaskLike, sprint?: TruthSprintLike | null) {
  if (!task.review_required || task.status !== "todo") return false;
  const qcState = getSprintFirstPassQcState(sprint);
  return qcState?.key === "approval_requested" || qcState?.key === "in_review";
}

function isSprintInActiveDeliveryReview(sprint: TruthSprintLike) {
  const qcState = getSprintFirstPassQcState(sprint);
  return qcState?.key === "approval_requested" || qcState?.key === "in_review";
}

export function deriveExecutionState(input: {
  totalDeliveryTasks: number;
  doneDeliveryTasks: number;
  queuedDeliveryTasks: number;
  runningDeliveryTasks: number;
  blockedDeliveryTasks: number;
  totalBootstrapTasks: number;
  queuedBootstrapTasks: number;
  runningBootstrapTasks: number;
  blockedBootstrapTasks: number;
  queuedJobs?: number;
  runningJobs?: number;
  blockedJobs?: number;
  staleRunning?: boolean;
  acceptancePending?: boolean;
  validationPending?: boolean;
  validationReady?: boolean;
  validationRunning?: boolean;
  revisionCycleActive?: boolean;
}) {
  const queuedJobs = input.queuedJobs ?? 0;
  const runningJobs = input.runningJobs ?? 0;
  const blockedJobs = input.blockedJobs ?? 0;

  if (input.blockedDeliveryTasks > 0 || blockedJobs > 0 || input.blockedBootstrapTasks > 0) {
    return {
      key: "blocked",
      label: "Blocked",
      description: "Some work is blocked and needs attention before delivery can continue.",
    } as const;
  }

  if (input.revisionCycleActive) {
    return {
      key: "revision_cycle",
      label: "Revision cycle active",
      description: "A delivery review requested changes, and the next revision is now the active stage.",
    } as const;
  }

  if (input.acceptancePending) {
    return {
      key: "acceptance_pending",
      label: "Awaiting delivery review",
      description: "Delivery review is active and waiting on a decision or feedback.",
    } as const;
  }

  if (input.validationRunning) {
    return {
      key: "validation_running",
      label: "QA in progress",
      description: "Implementation is complete, and QA/QC is actively reviewing the build now.",
    } as const;
  }

  if (input.validationReady) {
    return {
      key: "validation_ready",
      label: "QA ready",
      description: "Implementation is complete, and QA/QC is the next runnable checkpoint.",
    } as const;
  }

  if (input.validationPending) {
    return {
      key: "validation_pending",
      label: "QA queued",
      description: "Implementation is complete, but QA/QC is still blocked behind earlier sequencing work.",
    } as const;
  }

  if (input.runningDeliveryTasks > 0 || runningJobs > 0) {
    if (input.staleRunning) {
      return {
        key: "stale_running",
        label: "Needs update",
        description: "Work is marked in progress, but there has not been a recent execution update.",
      } as const;
    }

    return {
      key: "running",
      label: "Running",
      description: "Real delivery work is actively running right now.",
    } as const;
  }

  if (input.queuedDeliveryTasks > 0 || queuedJobs > 0) {
    return {
      key: "queued",
      label: "Queued",
      description: "Delivery tasks exist and are queued, but execution has not started yet.",
    } as const;
  }

  if (input.totalDeliveryTasks > 0 && input.doneDeliveryTasks === input.totalDeliveryTasks) {
    return {
      key: "completed",
      label: "Completed",
      description: "All tracked delivery tasks are complete.",
    } as const;
  }

  if (input.totalDeliveryTasks === 0 && input.totalBootstrapTasks > 0) {
    if (input.runningBootstrapTasks > 0) {
      return {
        key: "planning_running",
        label: "Planning in progress",
        description: "The team is finishing project setup before the main work starts.",
      } as const;
    }

    if (input.queuedBootstrapTasks > 0) {
      return {
        key: "planning_queued",
        label: "Kickoff queued",
        description: "Kickoff work is queued, but the main delivery work has not started yet.",
      } as const;
    }

    return {
      key: "planning_ready",
      label: "Ready for delivery",
      description: "Kickoff setup is complete. The next delivery phase has not started yet.",
    } as const;
  }

  return {
    key: "idle",
    label: "Not started",
    description: "No project work is visible yet.",
  } as const;
}

export function deriveProjectTruth(input: {
  project?: { id: string; status?: string | null; type?: string | null; intake?: any; links?: Record<string, string> | null; github_repo_binding?: any } | null;
  tasks?: (TruthTaskLike & { project_id?: string | null; assignee_agent_id?: string | null; owner_team_id?: string | null })[] | null;
  sprints?: (TruthSprintLike & { name?: string | null; approval_gate_required?: boolean | null; approval_gate_status?: string | null; delivery_review_required?: boolean | null; delivery_review_status?: string | null })[] | null;
  jobs?: Array<{ id?: string | null; status?: string | null; updated_at?: string | null; owner_agent_id?: string | null; summary?: string | null }> | null;
  agents?: Array<{ id?: string | null; status?: string | null; current_job_id?: string | null }> | null;
}) {
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const sprints = Array.isArray(input.sprints) ? input.sprints : [];
  const jobs = Array.isArray(input.jobs) ? input.jobs : [];
  const agents = Array.isArray(input.agents) ? input.agents : [];
  const sprintIds = getBootstrapSprintIds(sprints);
  const projectStatus = String(input.project?.status || "").toLowerCase();
  const projectCompleted = projectStatus === "completed" || projectStatus === "archived";

  const bootstrapTasks = tasks.filter((task) => matchesBootstrapTruth(task, sprintIds));
  const deliveryTasks = tasks.filter((task) => !bootstrapTasks.includes(task));

  const queuedJobs = jobs.filter((job) => job.status === "queued").length;
  const runningJobs = jobs.filter((job) => job.status === "in_progress").length;
  const blockedJobs = jobs.filter((job) => job.status === "blocked").length;

  const queuedDeliveryTasks = deliveryTasks.filter((task) => isQueuedStatus(task.status)).length;
  const runningDeliveryTasks = deliveryTasks.filter((task) => isRunningStatus(task.status)).length;
  const doneDeliveryTasks = deliveryTasks.filter((task) => isDoneStatus(task.status)).length;
  const blockedDeliveryTasks = deliveryTasks.filter((task) => isBlockedStatus(task.status)).length;

  const queuedBootstrapTasks = bootstrapTasks.filter((task) => isQueuedStatus(task.status)).length;
  const runningBootstrapTasks = bootstrapTasks.filter((task) => isRunningStatus(task.status)).length;
  const doneBootstrapTasks = bootstrapTasks.filter((task) => isDoneStatus(task.status)).length;
  const blockedBootstrapTasks = bootstrapTasks.filter((task) => isBlockedStatus(task.status)).length;

  const visibleWorkTotal = deliveryTasks.length + bootstrapTasks.length;
  const visibleWorkDone = doneDeliveryTasks + doneBootstrapTasks;
  let progressPct = visibleWorkTotal > 0 ? Math.round((visibleWorkDone / visibleWorkTotal) * 100) : 0;
  const latestRunningTaskUpdateMs = deliveryTasks
    .filter((task) => isRunningStatus(task.status) && task.updated_at)
    .map((task) => new Date(task.updated_at as string).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0] ?? null;
  const latestRunningJobUpdateMs = jobs
    .filter((job) => job.status === "in_progress" && job.updated_at)
    .map((job) => new Date(job.updated_at as string).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0] ?? null;
  const freshestRunningMs = [latestRunningTaskUpdateMs, latestRunningJobUpdateMs]
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => b - a)[0] ?? null;
  const staleRunning = Boolean((runningDeliveryTasks > 0 || runningJobs > 0) && freshestRunningMs && isStaleExecutionTimestamp(new Date(freshestRunningMs).toISOString(), 1 * 60 * 1000));
  const isValidationTask = (task: TruthTaskLike) => {
    const title = String(task.title || '').toLowerCase();
    return task.task_type === "qa_validation" || /acceptance|qa|qc|validate|review/.test(title);
  };
  const pendingFinalValidationTask = deliveryTasks.find((task) => isValidationTask(task) && (task.status === 'todo' || task.status === 'blocked'));
  const activeFinalValidationTask = deliveryTasks.find((task) => isValidationTask(task) && isRunningStatus(task.status));
  const pendingFinalValidationTaskBlocker = pendingFinalValidationTask && input.project
    ? getTaskExecutionBlocker({
        project: input.project as any,
        task: pendingFinalValidationTask as any,
        sprint: sprints.find((candidate) => candidate.id === pendingFinalValidationTask.sprint_id) as any,
        sprints: sprints as any,
        tasks: tasks as any,
        jobs: jobs as any,
        agents: agents as any,
      })
    : null;
  const canonicalProject = input.project ?? null;
  const buildReviewSprints = sprints.filter((sprint) => {
    const isBuildSprint = sprint.phase_key === "build";
    const deliveryReviewRequired = sprint.delivery_review_required === true || isBuildSprint;
    return deliveryReviewRequired;
  });
  const pendingDeliveryReview = buildReviewSprints.some((sprint) => isSprintInActiveDeliveryReview(sprint));
  const revisionCycleActive = buildReviewSprints.some((sprint) => (sprint.delivery_review_status ?? "not_requested") === "rejected");
  const deliveryReviewNotStarted = buildReviewSprints.some((sprint) => (sprint.delivery_review_status ?? "not_requested") === "not_requested");
  const acceptancePending = pendingDeliveryReview;
  const validationRunning = Boolean(!pendingDeliveryReview && !revisionCycleActive && activeFinalValidationTask);
  const validationReady = Boolean(
    !pendingDeliveryReview
    && !revisionCycleActive
    && doneDeliveryTasks > 0
    && runningDeliveryTasks === 0
    && pendingFinalValidationTask
    && !pendingFinalValidationTaskBlocker
  );
  const validationPending = Boolean(
    !pendingDeliveryReview
    && !revisionCycleActive
    && !validationReady
    && doneDeliveryTasks > 0
    && runningDeliveryTasks === 0
    && (pendingFinalValidationTask || deliveryReviewNotStarted)
  );
  const stuckWorkflowGuardrail = sprints.reduce<StuckWorkflowGuardrail | null>((match, sprint, index) => {
    if (match || sprint.status !== "active") return match;
    const sprintTasks = tasks.filter((task) => task.sprint_id === sprint.id);
    if (!sprintTasks.length) return match;
    const effectivelyComplete = sprintTasks.every((task) => task.status === "done" || task.status === "cancelled");
    if (!effectivelyComplete) return match;

    const gateBlocked = Boolean(
      (sprint.approval_gate_required && sprint.approval_gate_status !== "approved")
      || ((sprint.phase_key === "build" || sprint.delivery_review_required) && sprint.delivery_review_status !== "approved")
    );
    if (gateBlocked) return match;

    const nextSprint = sprints.slice(index + 1).find((candidate) => candidate.status !== "completed" && candidate.status !== "archived");
    if (!nextSprint || nextSprint.status === "active") return match;

    const nextSprintQueuedTasks = tasks.filter((task) => task.sprint_id === nextSprint.id && task.status === "todo");
    if (!nextSprintQueuedTasks.length) return match;

    const nextSprintStillLocked = nextSprintQueuedTasks.every((task) => {
      const blocker = canonicalProject
        ? getTaskExecutionBlocker({
            project: canonicalProject as any,
            task: task as any,
            sprint: nextSprint as any,
            sprints: sprints as any,
            tasks: tasks as any,
            jobs: jobs as any,
            agents: agents as any,
          })
        : null;
      return blocker?.key === "waiting_for_kickoff_completion";
    });
    if (!nextSprintStillLocked) return match;

    return {
      activeSprintId: sprint.id,
      activeSprintName: sprint.name || "Current phase",
      nextSprintId: nextSprint.id,
      nextSprintName: nextSprint.name || "Next phase",
      reason: "phase_complete_not_advanced",
      detail: `${sprint.name || "Current phase"} is effectively complete, but ${nextSprint.name || "the next phase"} is still ${nextSprint.status || "queued"} instead of advancing.`,
    };
  }, null);
  if ((acceptancePending || validationPending) && progressPct >= 100) {
    progressPct = 90;
  }
  if (projectCompleted) {
    progressPct = 100;
  }

  const execution = projectCompleted
    ? {
        key: "completed",
        label: "Completed",
        description: "This project is finished and closed out.",
      } as const
    : stuckWorkflowGuardrail
      ? {
          key: "stuck_progression",
          label: "Needs phase handoff",
          description: stuckWorkflowGuardrail.detail,
        } as const
      : deriveExecutionState({
    totalDeliveryTasks: deliveryTasks.length,
    doneDeliveryTasks,
    queuedDeliveryTasks,
    runningDeliveryTasks,
    blockedDeliveryTasks,
    totalBootstrapTasks: bootstrapTasks.length,
    queuedBootstrapTasks,
    runningBootstrapTasks,
    blockedBootstrapTasks,
    queuedJobs,
    runningJobs,
    blockedJobs,
    staleRunning,
    acceptancePending,
    validationPending,
    validationReady,
    validationRunning,
    revisionCycleActive,
  });

  const headline = projectCompleted
    ? "Project completed"
    : deliveryTasks.length > 0
    ? execution.key === "running"
      ? "Work is underway"
      : execution.key === "stale_running"
        ? "Work needs an update"
        : execution.key === "acceptance_pending"
          ? pendingDeliveryReview ? "Awaiting delivery review" : "Awaiting acceptance"
          : execution.key === "revision_cycle"
            ? "Revision cycle active"
            : execution.key === "validation_pending"
              ? "QA queued"
              : execution.key === "validation_ready"
                ? "QA ready"
                : execution.key === "validation_running"
                  ? "QA in progress"
                : execution.key === "stuck_progression"
                  ? "Needs phase handoff"
          : execution.key === "queued"
            ? doneBootstrapTasks > 0
              ? "Kickoff is complete"
              : "Work is lined up"
            : execution.key === "completed"
              ? "Work is complete"
              : execution.key === "blocked"
                ? "Work is blocked"
                : "Work has started"
    : bootstrapTasks.length > 0
      ? doneBootstrapTasks === bootstrapTasks.length
        ? "Kickoff is complete"
        : "Kickoff is still in setup"
      : "No work added yet";

  const summary = projectCompleted
    ? "This project is complete. You can still request a revision later if follow-up changes are needed."
    : deliveryTasks.length > 0
    ? execution.key === "stale_running"
      ? `${doneDeliveryTasks} of ${deliveryTasks.length} active work item${deliveryTasks.length === 1 ? "" : "s"} complete. ${queuedDeliveryTasks} queued, ${runningDeliveryTasks} marked in progress, but there has been no recent execution update.`
      : execution.key === "acceptance_pending"
        ? pendingDeliveryReview
          ? `${doneDeliveryTasks} of ${deliveryTasks.length} active work item${deliveryTasks.length === 1 ? "" : "s"} complete. Delivery review is now active and waiting on a decision.`
          : `${doneDeliveryTasks} of ${deliveryTasks.length} active work item${deliveryTasks.length === 1 ? "" : "s"} complete. Implementation is done, and a final acceptance checkpoint is waiting for decision.`
        : execution.key === "revision_cycle"
          ? `${doneDeliveryTasks} of ${deliveryTasks.length} active work item${deliveryTasks.length === 1 ? "" : "s"} complete. Delivery review requested changes, so the project is back in revision.`
          : execution.key === "validation_pending"
            ? `${doneDeliveryTasks} of ${deliveryTasks.length} active work item${deliveryTasks.length === 1 ? "" : "s"} complete. Implementation is done, but QA/QC is still held behind earlier sequencing work.`
            : execution.key === "validation_ready"
              ? `${doneDeliveryTasks} of ${deliveryTasks.length} active work item${deliveryTasks.length === 1 ? "" : "s"} complete. Implementation is done, and QA/QC is the next runnable checkpoint.`
              : execution.key === "validation_running"
                ? `${doneDeliveryTasks} of ${deliveryTasks.length} active work item${deliveryTasks.length === 1 ? "" : "s"} complete. Implementation is done, and QA/QC is actively reviewing the current build.`
              : execution.key === "stuck_progression"
                ? stuckWorkflowGuardrail?.detail || `${doneDeliveryTasks} of ${deliveryTasks.length} active work items are complete, but the next phase still has not advanced.`
        : doneBootstrapTasks > 0
          ? `Kickoff is complete. ${doneDeliveryTasks} of ${deliveryTasks.length} active work item${deliveryTasks.length === 1 ? "" : "s"} complete. ${queuedDeliveryTasks} queued, ${runningDeliveryTasks} in progress, ${blockedDeliveryTasks} blocked.`
          : `${doneDeliveryTasks} of ${deliveryTasks.length} active work item${deliveryTasks.length === 1 ? "" : "s"} complete. ${queuedDeliveryTasks} queued, ${runningDeliveryTasks} in progress, ${blockedDeliveryTasks} blocked.`
    : bootstrapTasks.length > 0
      ? doneBootstrapTasks === bootstrapTasks.length
        ? "Kickoff is complete. Delivery work is queued to begin next."
        : `${bootstrapTasks.length} kickoff task${bootstrapTasks.length === 1 ? " is" : "s are"} visible (${queuedBootstrapTasks} queued, ${runningBootstrapTasks} in progress, ${doneBootstrapTasks} done). The project is still getting set up before the main work starts.`
      : "No kickoff tasks or delivery work are visible yet.";

  const taskBoard = canonicalProject
    ? tasks.reduce(
        (acc, task) => {
          const sprint = (input.sprints || []).find((candidate) => candidate.id === task.sprint_id) as any;

          if (task.status === "done") {
            acc.done.push(task.id || "");
            return acc;
          }
          if (task.status === "in_progress" || task.status === "review" || isTaskInActiveCheckpointReview(task, sprint)) {
            acc.inProgress.push(task.id || "");
            return acc;
          }

          const blocker = getTaskExecutionBlocker({
            project: canonicalProject,
            task: task as any,
            sprint,
            sprints: (input.sprints || []) as any,
            tasks: tasks as any,
            jobs: jobs as any,
            agents: agents as any,
          });

          if (task.status === "blocked") {
            acc.stalled.push(task.id || "");
            if (blocker) acc.blockers[task.id || ""] = blocker;
            return acc;
          }
          if (task.status !== "todo") return acc;

          if (blocker) {
            if (isQueuedTaskBlocker(blocker)) {
              acc.queued.push(task.id || "");
            } else {
              acc.stalled.push(task.id || "");
            }
            acc.blockers[task.id || ""] = blocker;
          } else acc.queued.push(task.id || "");
          return acc;
        },
        { queued: [] as string[], inProgress: [] as string[], stalled: [] as string[], done: [] as string[], blockers: {} as Record<string, ReturnType<typeof getTaskExecutionBlocker>> }
      )
    : { queued: [] as string[], inProgress: [] as string[], stalled: [] as string[], done: [] as string[], blockers: {} as Record<string, ReturnType<typeof getTaskExecutionBlocker>> };

  return {
    counts: {
      delivery: {
        total: deliveryTasks.length,
        queued: queuedDeliveryTasks,
        running: runningDeliveryTasks,
        done: doneDeliveryTasks,
        blocked: blockedDeliveryTasks,
      },
      bootstrap: {
        total: bootstrapTasks.length,
        queued: queuedBootstrapTasks,
        running: runningBootstrapTasks,
        done: doneBootstrapTasks,
        blocked: blockedBootstrapTasks,
      },
      all: {
        total: tasks.length,
      },
      jobs: {
        queued: queuedJobs,
        running: runningJobs,
        blocked: blockedJobs,
      },
    },
    progressPct,
    execution,
    headline,
    summary,
    guardrails: {
      stuckWorkflow: stuckWorkflowGuardrail,
    },
    taskBoard,
  };
}

export function deriveSprintTruth(input: {
  sprint?: TruthSprintLike | null;
  tasks?: TruthTaskLike[] | null;
}) {
  const sprint = input.sprint;
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const bootstrap = sprint?.phase_key
    ? sprint.phase_key === "discover"
    : Boolean(sprint?.auto_generated) || (tasks.length > 0 && tasks.every((task) => isBootstrapTask(task)));
  const relevantTasks = bootstrap ? tasks : tasks.filter((task) => !isBootstrapTask(task));
  const queued = relevantTasks.filter((task) => isQueuedStatus(task.status)).length;
  const running = relevantTasks.filter((task) => isRunningStatus(task.status)).length;
  const done = relevantTasks.filter((task) => isDoneStatus(task.status)).length;
  const blocked = relevantTasks.filter((task) => isBlockedStatus(task.status)).length;
  const total = relevantTasks.length;

  return {
    category: bootstrap ? "bootstrap" : "delivery",
    totalTasks: total,
    doneTasks: done,
    queuedTasks: queued,
    runningTasks: running,
    blockedTasks: blocked,
    progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
    hiddenBootstrapTasks: bootstrap ? 0 : Math.max(0, tasks.length - total),
  } as const;
}

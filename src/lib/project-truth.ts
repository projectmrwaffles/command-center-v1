import { getBootstrapSprintIds, isBootstrapTask, matchesBootstrapTruth } from "./project-bootstrap";

export type TruthTaskLike = {
  id?: string | null;
  sprint_id?: string | null;
  status?: string | null;
  task_metadata?: Record<string, unknown> | null;
};

export type TruthSprintLike = {
  id: string;
  auto_generated?: boolean | null;
  phase_key?: string | null;
  status?: string | null;
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

  if (input.runningDeliveryTasks > 0 || runningJobs > 0) {
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
  tasks?: TruthTaskLike[] | null;
  sprints?: TruthSprintLike[] | null;
  jobs?: Array<{ status?: string | null }> | null;
}) {
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const sprints = Array.isArray(input.sprints) ? input.sprints : [];
  const jobs = Array.isArray(input.jobs) ? input.jobs : [];
  const sprintIds = getBootstrapSprintIds(sprints);

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

  const progressPct = deliveryTasks.length > 0 ? Math.round((doneDeliveryTasks / deliveryTasks.length) * 100) : 0;
  const execution = deriveExecutionState({
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
  });

  const headline = deliveryTasks.length > 0
    ? execution.key === "running"
      ? "Work is underway"
      : execution.key === "queued"
        ? "Work is lined up"
        : execution.key === "completed"
          ? "Work is complete"
          : execution.key === "blocked"
            ? "Work is blocked"
            : "Work has started"
    : bootstrapTasks.length > 0
      ? "Kickoff is still in setup"
      : "No work added yet";

  const summary = deliveryTasks.length > 0
    ? `${doneDeliveryTasks} of ${deliveryTasks.length} active work item${deliveryTasks.length === 1 ? "" : "s"} complete. ${queuedDeliveryTasks} queued, ${runningDeliveryTasks} in progress, ${blockedDeliveryTasks} blocked.`
    : bootstrapTasks.length > 0
      ? `${bootstrapTasks.length} kickoff task${bootstrapTasks.length === 1 ? " is" : "s are"} visible (${queuedBootstrapTasks} queued, ${runningBootstrapTasks} in progress, ${doneBootstrapTasks} done). The project is still getting set up before the main work starts.`
      : "No kickoff tasks or delivery work are visible yet.";

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

import type { ProjectIntake } from "@/lib/project-intake";
import type { ProjectRequirements } from "@/lib/project-requirements.types";

export const ATTACHMENT_INTAKE_SPRINT_NAME = "Attachment intake";
export const ATTACHMENT_INTAKE_TASK_TITLE = "Wait for attachment-derived requirements";

export function hasAttachmentDerivedRequirements(requirements: ProjectRequirements | null | undefined) {
  return Boolean(requirements?.sources?.some((source) => source?.type !== "intake" && Array.isArray(source.evidence) && source.evidence.length > 0));
}

export function getAttachmentKickoffState(intake?: ProjectIntake | Record<string, unknown> | null) {
  const state = (intake as Record<string, unknown> | null | undefined)?.attachmentKickoffState;
  if (!state || typeof state !== "object") return null;
  return state as {
    status?: string;
    shellSeededAt?: string;
    finalizedAt?: string;
  };
}

export function buildAttachmentKickoffWaitingIntake<T extends Record<string, unknown> | null | undefined>(intake?: T) {
  return {
    ...((intake || {}) as Record<string, unknown>),
    attachmentKickoffState: {
      status: "waiting_for_attachment_requirements",
      shellSeededAt: new Date().toISOString(),
    },
  } as (T extends null | undefined ? Record<string, unknown> : NonNullable<T>) & {
    attachmentKickoffState: {
      status: string;
      shellSeededAt: string;
    };
  };
}

export function buildAttachmentKickoffReadyIntake<T extends Record<string, unknown> | null | undefined>(intake?: T) {
  const currentState = getAttachmentKickoffState(intake);
  return {
    ...((intake || {}) as Record<string, unknown>),
    attachmentKickoffState: {
      ...(currentState || {}),
      status: "requirements_ready",
    },
  } as (T extends null | undefined ? Record<string, unknown> : NonNullable<T>) & {
    attachmentKickoffState: {
      status: string;
      shellSeededAt?: string;
      finalizedAt?: string;
    };
  };
}

export function buildAttachmentKickoffFinalizedIntake<T extends Record<string, unknown> | null | undefined>(intake?: T) {
  const currentState = getAttachmentKickoffState(intake);
  return {
    ...((intake || {}) as Record<string, unknown>),
    attachmentKickoffState: {
      ...(currentState || {}),
      status: "finalized",
      finalizedAt: new Date().toISOString(),
    },
  } as (T extends null | undefined ? Record<string, unknown> : NonNullable<T>) & {
    attachmentKickoffState: {
      status: string;
      shellSeededAt?: string;
      finalizedAt: string;
    };
  };
}

export function shouldSeedAttachmentKickoffShell(input: {
  hasAttachments: boolean;
  intake?: ProjectIntake | null;
}) {
  return input.hasAttachments && !hasAttachmentDerivedRequirements(input.intake?.requirements);
}

export function shouldFinalizeAttachmentProjectNow(input: {
  hasAttachments: boolean;
  intake?: ProjectIntake | null;
}) {
  return !input.hasAttachments || hasAttachmentDerivedRequirements(input.intake?.requirements);
}

export function isAttachmentKickoffShellSprint(sprint: { name?: string | null } | null | undefined) {
  return (sprint?.name || "").trim().toLowerCase() === ATTACHMENT_INTAKE_SPRINT_NAME.toLowerCase();
}

export function filterObsoleteAttachmentKickoffShellState<
  TSprint extends { id?: string | null; name?: string | null },
  TTask extends { sprint_id?: string | null },
>(input: {
  sprints?: TSprint[] | null;
  tasks?: TTask[] | null;
}) {
  const sprints = Array.isArray(input.sprints) ? input.sprints : [];
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const shellSprintIds = new Set(
    sprints
      .filter((sprint) => isAttachmentKickoffShellSprint(sprint))
      .map((sprint) => sprint.id)
      .filter((id): id is string => Boolean(id))
  );

  const hasRealSprint = sprints.some((sprint) => !isAttachmentKickoffShellSprint(sprint));
  if (!hasRealSprint || shellSprintIds.size === 0) {
    return { sprints, tasks, filtered: false } as const;
  }

  return {
    sprints: sprints.filter((sprint) => !isAttachmentKickoffShellSprint(sprint)),
    tasks: tasks.filter((task) => !task.sprint_id || !shellSprintIds.has(task.sprint_id)),
    filtered: true,
  } as const;
}

export function shouldFinalizeProjectAfterAttachmentUpload(input: {
  sprintCount: number;
  attachmentRequirementsReady: boolean;
  hasAttachmentKickoffShell?: boolean;
}) {
  return input.attachmentRequirementsReady && (input.sprintCount === 0 || Boolean(input.hasAttachmentKickoffShell));
}

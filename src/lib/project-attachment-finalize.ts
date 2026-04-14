import type { ProjectIntake } from "@/lib/project-intake";
import type { ProjectRequirements } from "@/lib/project-requirements.types";

export const ATTACHMENT_INTAKE_SPRINT_NAME = "Attachment intake";
export const ATTACHMENT_INTAKE_TASK_TITLE = "Process attached materials";

export type AttachmentKickoffStage =
  | "waiting_for_attachment_requirements"
  | "upload_received"
  | "extracting_attachment_text"
  | "deriving_requirements"
  | "requirements_ready"
  | "seeding_kickoff"
  | "starting_work"
  | "finalized"
  | "failed";

const ATTACHMENT_STAGE_METADATA: Record<AttachmentKickoffStage, { label: string; detail: string; progressPct: number; active: boolean }> = {
  waiting_for_attachment_requirements: {
    label: "Waiting for files",
    detail: "Project created. Waiting for attached files to arrive before kickoff starts.",
    progressPct: 5,
    active: true,
  },
  upload_received: {
    label: "Upload received",
    detail: "Attached files were received and are being saved to the project.",
    progressPct: 20,
    active: true,
  },
  extracting_attachment_text: {
    label: "Extracting PRD text",
    detail: "Reading PDFs and images to pull project evidence into intake.",
    progressPct: 40,
    active: true,
  },
  deriving_requirements: {
    label: "Deriving requirements",
    detail: "Turning uploaded material into structured project requirements.",
    progressPct: 62,
    active: true,
  },
  requirements_ready: {
    label: "Requirements ready",
    detail: "Attachment-derived requirements are ready and kickoff can be prepared.",
    progressPct: 78,
    active: true,
  },
  seeding_kickoff: {
    label: "Seeding kickoff",
    detail: "Creating the initial kickoff plan from the extracted requirements.",
    progressPct: 88,
    active: true,
  },
  starting_work: {
    label: "Starting work",
    detail: "Kickoff is dispatching and the first work should appear shortly.",
    progressPct: 96,
    active: true,
  },
  finalized: {
    label: "Kickoff ready",
    detail: "Attachment intake is complete and the project has moved into normal kickoff/workflow state.",
    progressPct: 100,
    active: false,
  },
  failed: {
    label: "Attachment processing failed",
    detail: "Attachment intake hit an error and needs attention before kickoff can continue.",
    progressPct: 100,
    active: false,
  },
};

export function hasAttachmentDerivedRequirements(requirements: ProjectRequirements | null | undefined) {
  return Boolean(requirements?.sources?.some((source) => source?.type !== "intake" && Array.isArray(source.evidence) && source.evidence.length > 0));
}

export function getAttachmentKickoffState(intake?: ProjectIntake | Record<string, unknown> | null) {
  const state = (intake as Record<string, unknown> | null | undefined)?.attachmentKickoffState;
  if (!state || typeof state !== "object") return null;
  return state as {
    status?: AttachmentKickoffStage | string;
    shellSeededAt?: string;
    finalizedAt?: string;
    updatedAt?: string;
    detail?: string;
    label?: string;
    progressPct?: number;
    active?: boolean;
    fileCount?: number;
    error?: string;
  };
}

export function buildAttachmentKickoffStageState<T extends Record<string, unknown> | null | undefined>(
  intake: T,
  status: AttachmentKickoffStage,
  extras?: Record<string, unknown>,
) {
  const currentState = getAttachmentKickoffState(intake);
  const meta = ATTACHMENT_STAGE_METADATA[status];
  return {
    ...((intake || {}) as Record<string, unknown>),
    attachmentKickoffState: {
      ...(currentState || {}),
      ...(extras || {}),
      status,
      label: meta.label,
      detail: typeof extras?.detail === "string" ? extras.detail : meta.detail,
      progressPct: meta.progressPct,
      active: meta.active,
      updatedAt: new Date().toISOString(),
    },
  } as unknown as (T extends null | undefined ? Record<string, unknown> : NonNullable<T>) & {
    attachmentKickoffState: Record<string, unknown>;
  };
}

export function buildAttachmentKickoffWaitingIntake<T extends Record<string, unknown> | null | undefined>(intake?: T) {
  return buildAttachmentKickoffStageState(intake, "waiting_for_attachment_requirements", {
    shellSeededAt: new Date().toISOString(),
  }) as (T extends null | undefined ? Record<string, unknown> : NonNullable<T>) & {
    attachmentKickoffState: {
      status: string;
      shellSeededAt: string;
    };
  };
}

export function buildAttachmentKickoffReadyIntake<T extends Record<string, unknown> | null | undefined>(intake?: T) {
  return buildAttachmentKickoffStageState(intake, "requirements_ready") as (T extends null | undefined ? Record<string, unknown> : NonNullable<T>) & {
    attachmentKickoffState: {
      status: string;
      shellSeededAt?: string;
      finalizedAt?: string;
    };
  };
}

export function buildAttachmentKickoffFinalizedIntake<T extends Record<string, unknown> | null | undefined>(intake?: T) {
  return buildAttachmentKickoffStageState(intake, "finalized", {
    finalizedAt: new Date().toISOString(),
  }) as (T extends null | undefined ? Record<string, unknown> : NonNullable<T>) & {
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

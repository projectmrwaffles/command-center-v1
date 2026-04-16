import { buildAttachmentKickoffFinalizedIntake, buildAttachmentKickoffReadyIntake, buildAttachmentKickoffStageState, getAttachmentKickoffState, hasAttachmentDerivedRequirements, hasOnlyLegacyAttachmentShellSprints, shouldFinalizeProjectAfterAttachmentUpload } from "@/lib/project-attachment-finalize";
import type { ProjectIntake } from "@/lib/project-intake";
import { finalizeProjectCreate } from "@/lib/project-create-finalize";
import { deriveProjectRequirements, extractRequirementsFromUploadedFile } from "@/lib/project-requirements";
import type { ProjectRequirements } from "@/lib/project-requirements.types";

const STORAGE_BUCKET = "project_docs";

function shouldRunRequirementsRepair() {
  return true;
}

function getExistingRequirements(intake?: ProjectIntakeLike | null) {
  return (((intake || {}) as Record<string, unknown>).requirements as ProjectRequirements | null | undefined) || null;
}

type DbClient = {
  from: (table: string) => any;
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: { message?: string } | null }>;
    };
  };
};

type ProjectIntakeLike = {
  summary?: string | null;
  goals?: string | null;
  requirements?: ProjectRequirements | null;
  attachmentKickoffState?: Record<string, unknown> | null;
};

type AttachmentProjectLike = {
  id: string;
  name?: string | null;
  type?: string | null;
  team_id?: string | null;
  intake?: any;
  links?: Record<string, string> | null;
  github_repo_binding?: any;
};

const ATTACHMENT_RECOVERY_TIMEOUT_MS = 2 * 60 * 1000;
const ACTIVE_ATTACHMENT_RECOVERY_STATES = new Set([
  "upload_received",
  "extracting_attachment_text",
  "deriving_requirements",
  "requirements_ready",
  "seeding_kickoff",
  "starting_work",
]);

const TERMINAL_ATTACHMENT_RECOVERY_STATES = new Set([
  "retryable_failure",
  "failed",
]);

export function isStaleAttachmentRecoveryState(intake?: ProjectIntakeLike | null, now = Date.now()) {
  const state = getAttachmentKickoffState(intake as Record<string, unknown> | null | undefined);
  if (!state?.active || !state?.status || !ACTIVE_ATTACHMENT_RECOVERY_STATES.has(state.status)) {
    return false;
  }

  const updatedAt = typeof state.updatedAt === "string" ? Date.parse(state.updatedAt) : NaN;
  if (!Number.isFinite(updatedAt)) {
    return true;
  }

  return (now - updatedAt) >= ATTACHMENT_RECOVERY_TIMEOUT_MS;
}

export function shouldAttemptAttachmentRecovery(intake?: ProjectIntakeLike | null, now = Date.now()) {
  const state = getAttachmentKickoffState(intake as Record<string, unknown> | null | undefined);
  if (!state?.status) return false;
  if (TERMINAL_ATTACHMENT_RECOVERY_STATES.has(state.status)) return true;
  return isStaleAttachmentRecoveryState(intake, now);
}

async function persistAttachmentFailureState(
  db: DbClient,
  input: {
    projectId: string;
    intake: ProjectIntakeLike | Record<string, unknown> | null | undefined;
    detail: string;
    recoverable: boolean;
    fileCount?: number;
  },
) {
  const nextIntake = buildAttachmentKickoffStageState(
    (input.intake || {}) as Record<string, unknown>,
    input.recoverable ? "retryable_failure" : "failed",
    {
      error: input.detail,
      detail: input.detail,
      fileCount: input.fileCount,
      recoverable: input.recoverable,
      retryable: input.recoverable,
    },
  );

  const { error } = await db
    .from("projects")
    .update({
      intake: nextIntake,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.projectId);

  if (error) {
    throw new Error(error.message || "Failed to persist attachment failure state");
  }

  return nextIntake as ProjectIntakeLike;
}

export async function repairMissingPdfAttachmentRequirements(
  db: DbClient,
  input: { projectId: string; intake?: ProjectIntakeLike | null }
) {
  if (!shouldRunRequirementsRepair()) {
    return { repaired: false, requirements: getExistingRequirements(input.intake), attachmentDocumentCount: 0, extractedDocumentCount: 0 } as const;
  }

  const logFailure = (stage: string, error: unknown) => {
    console.warn(`[project-requirements-repair] ${stage} for project ${input.projectId}`, error);
  };
  const currentIntake = (input.intake || {}) as Record<string, unknown>;
  const existingRequirements = getExistingRequirements(input.intake);

  if (hasAttachmentDerivedRequirements(existingRequirements)) {
    return { repaired: false, requirements: existingRequirements, attachmentDocumentCount: 0, extractedDocumentCount: 0 } as const;
  }

  const { data: attachmentDocuments, error: documentsError } = await db
    .from("project_documents")
    .select("title, type, mime_type, storage_path, created_at")
    .eq("project_id", input.projectId)
    .in("type", ["prd_pdf", "image"])
    .order("created_at", { ascending: true });

  if (documentsError || !attachmentDocuments?.length) {
    return { repaired: false, requirements: existingRequirements, attachmentDocumentCount: 0, extractedDocumentCount: 0 } as const;
  }

  const extractedDocuments: Array<{ title: string; type: string; text?: string | null }> = [];
  for (const document of attachmentDocuments) {
    if (!document?.storage_path) continue;

    try {
      const { data: file, error: downloadError } = await db.storage.from(STORAGE_BUCKET).download(document.storage_path);
      if (downloadError || !file) {
        if (downloadError) logFailure(`storage download failed for ${document.storage_path}`, downloadError);
        continue;
      }

      if (typeof file.arrayBuffer !== "function") {
        logFailure(`downloaded file missing arrayBuffer() for ${document.storage_path}`, new Error("Unsupported storage response type"));
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      extractedDocuments.push(
        await extractRequirementsFromUploadedFile({
          buffer,
          mimeType: document.mime_type || null,
          title: document.title || "Untitled upload",
          type: document.type || "prd_pdf",
        })
      );
    } catch (error) {
      logFailure(`requirement extraction failed for ${document.storage_path}`, error);
    }
  }

  if (extractedDocuments.length === 0) {
    return {
      repaired: false,
      requirements: existingRequirements,
      attachmentDocumentCount: attachmentDocuments.length,
      extractedDocumentCount: 0,
    } as const;
  }

  const nextRequirements = deriveProjectRequirements({
    intakeSummary: typeof currentIntake.summary === "string" ? currentIntake.summary : null,
    intakeGoals: typeof currentIntake.goals === "string" ? currentIntake.goals : null,
    existing: existingRequirements,
    documents: extractedDocuments,
  });

  if (!hasAttachmentDerivedRequirements(nextRequirements)) {
    return {
      repaired: false,
      requirements: existingRequirements,
      attachmentDocumentCount: attachmentDocuments.length,
      extractedDocumentCount: extractedDocuments.length,
    } as const;
  }

  const nextIntake = {
    ...currentIntake,
    requirements: nextRequirements,
  };

  const { error: updateError } = await db
    .from("projects")
    .update({
      intake: nextIntake,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.projectId);

  if (updateError) {
    logFailure("failed to persist repaired requirements", updateError);
    return {
      repaired: false,
      requirements: existingRequirements,
      attachmentDocumentCount: attachmentDocuments.length,
      extractedDocumentCount: extractedDocuments.length,
    } as const;
  }

  return {
    repaired: true,
    requirements: nextRequirements,
    intake: nextIntake,
    attachmentDocumentCount: attachmentDocuments.length,
    extractedDocumentCount: extractedDocuments.length,
  } as const;
}

async function finalizeRecoveredAttachmentProject(
  db: DbClient,
  input: { project: AttachmentProjectLike; intake: ProjectIntakeLike | null; sprintRows: Array<{ id: string; name?: string | null }> | null | undefined }
) {
  const hasLegacyAttachmentShell = hasOnlyLegacyAttachmentShellSprints(input.sprintRows || []);
  if (hasLegacyAttachmentShell && input.sprintRows?.length) {
    const sprintIds = input.sprintRows.map((sprint) => sprint.id).filter(Boolean);
    if (sprintIds.length > 0) {
      const { error: deleteTasksError } = await db.from("sprint_items").delete().in("sprint_id", sprintIds);
      if (deleteTasksError) throw new Error(deleteTasksError.message);
      const { error: deleteSprintsError } = await db.from("sprints").delete().in("id", sprintIds);
      if (deleteSprintsError) throw new Error(deleteSprintsError.message);
    }
  }

  const finalizedIntake = buildAttachmentKickoffFinalizedIntake(input.intake as ProjectIntake) as ProjectIntakeLike;
  const { error: persistFinalizeError } = await db
    .from("projects")
    .update({
      intake: finalizedIntake,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.project.id);

  if (persistFinalizeError) {
    throw new Error(persistFinalizeError.message || "Failed to persist finalized attachment kickoff state");
  }

  await finalizeProjectCreate(db as any, {
    project: {
      ...input.project,
      intake: finalizedIntake as any,
    },
    name: input.project.name || "Untitled project",
    type: input.project.type || "other",
    intake: finalizedIntake as any,
    links: input.project.links || null,
    githubRepoBinding: input.project.github_repo_binding || null,
    teamId: input.project.team_id || null,
  });

  return finalizedIntake;
}

export async function processAttachmentBackedProject(
  db: DbClient,
  input: {
    project: AttachmentProjectLike;
    forceProcessing?: boolean;
    fileCount?: number;
    failureDetail?: string;
  }
) {
  const project = input.project;
  const shouldProcess = input.forceProcessing || shouldAttemptAttachmentRecovery(project.intake || null);
  const repaired = shouldProcess
    ? await repairMissingPdfAttachmentRequirements(db, {
        projectId: project.id,
        intake: project.intake || null,
      })
    : ({ repaired: false, requirements: getExistingRequirements(project.intake || null), intake: project.intake || null, attachmentDocumentCount: 0, extractedDocumentCount: 0 } as const);

  let resolvedIntake = (repaired.intake || project.intake || null) as ProjectIntakeLike | null;
  const effectiveRequirements = repaired.requirements || getExistingRequirements(resolvedIntake);
  const attachmentRequirementsReady = hasAttachmentDerivedRequirements(effectiveRequirements);

  const { count: sprintCount, error: sprintCountError } = await db
    .from("sprints")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id);

  if (sprintCountError) {
    throw new Error(sprintCountError.message || "Failed to inspect project sprint state");
  }

  const { data: sprintRows, error: sprintRowsError } = await db
    .from("sprints")
    .select("id, name")
    .eq("project_id", project.id);

  if (sprintRowsError) {
    throw new Error(sprintRowsError.message || "Failed to inspect project sprint state");
  }

  const hasLegacyAttachmentShell = hasOnlyLegacyAttachmentShellSprints(sprintRows || []);
  const shouldFinalize = shouldFinalizeProjectAfterAttachmentUpload({
    sprintCount: sprintCount ?? 0,
    attachmentRequirementsReady,
  }) || (attachmentRequirementsReady && hasLegacyAttachmentShell);

  let finalized = false;
  if (attachmentRequirementsReady && shouldFinalize) {
    resolvedIntake = await finalizeRecoveredAttachmentProject(db, {
      project,
      intake: resolvedIntake,
      sprintRows: sprintRows || [],
    });
    finalized = true;
  } else if (attachmentRequirementsReady && resolvedIntake) {
    const readyIntake = buildAttachmentKickoffReadyIntake(resolvedIntake as Record<string, unknown>);
    resolvedIntake = buildAttachmentKickoffStageState(readyIntake as Record<string, unknown>, "requirements_ready", {
      fileCount: input.fileCount,
      detail: input.failureDetail || undefined,
    }) as ProjectIntakeLike;
    const { error: readyPersistError } = await db
      .from("projects")
      .update({
        intake: resolvedIntake,
        updated_at: new Date().toISOString(),
      })
      .eq("id", project.id);

    if (readyPersistError) {
      throw new Error(readyPersistError.message || "Failed to persist attachment requirements-ready state");
    }
  } else if (shouldProcess) {
    resolvedIntake = await persistAttachmentFailureState(db, {
      projectId: project.id,
      intake: resolvedIntake,
      detail: input.failureDetail || (repaired.attachmentDocumentCount > 0
        ? "Attachment processing paused before requirements could be derived. The saved files can be retried from project storage."
        : "Attachment processing failed before any recoverable files were available. Re-upload the attachment to continue."),
      recoverable: repaired.attachmentDocumentCount > 0,
      fileCount: input.fileCount,
    });
  }

  return {
    repaired: repaired.repaired,
    finalized,
    attachmentRequirementsReady,
    recoverable: !attachmentRequirementsReady && repaired.attachmentDocumentCount > 0,
    attachmentDocumentCount: repaired.attachmentDocumentCount,
    extractedDocumentCount: repaired.extractedDocumentCount,
    project: {
      ...project,
      intake: resolvedIntake as any,
    },
    requirements: effectiveRequirements,
  } as const;
}

export async function recoverAttachmentUploadFailure(
  db: DbClient,
  input: {
    projectId: string;
    intake?: ProjectIntakeLike | null;
    fileCount?: number;
    errorDetail?: string;
  }
) {
  const processed = await processAttachmentBackedProject(db, {
    project: {
      id: input.projectId,
      intake: input.intake || null,
    },
    forceProcessing: true,
    fileCount: input.fileCount,
    failureDetail: input.errorDetail,
  });

  return {
    recovered: processed.attachmentRequirementsReady,
    repaired: processed.repaired,
    requirements: processed.requirements,
    intake: processed.project.intake,
  } as const;
}

export async function reconcileAttachmentBackedProjectCreate(
  db: DbClient,
  input: {
    project: AttachmentProjectLike;
  }
) {
  const processed = await processAttachmentBackedProject(db, {
    project: input.project,
  });

  return {
    repaired: processed.repaired,
    finalized: processed.finalized,
    attachmentRequirementsReady: processed.attachmentRequirementsReady,
    project: processed.project,
  } as const;
}

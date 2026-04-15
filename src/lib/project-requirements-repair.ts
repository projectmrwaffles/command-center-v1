import { buildAttachmentKickoffFinalizedIntake, buildAttachmentKickoffReadyIntake, buildAttachmentKickoffStageState, getAttachmentKickoffState, hasAttachmentDerivedRequirements, hasOnlyLegacyAttachmentShellSprints } from "@/lib/project-attachment-finalize";
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

async function persistAttachmentRecoveryFailure(
  db: DbClient,
  projectId: string,
  intake: ProjectIntakeLike | Record<string, unknown> | null | undefined,
  detail: string,
) {
  const nextIntake = buildAttachmentKickoffStageState((intake || {}) as Record<string, unknown>, "failed", {
    error: detail,
    detail,
  });

  const { error } = await db
    .from("projects")
    .update({
      intake: nextIntake,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message || "Failed to persist recovered attachment failure state");
  }

  return nextIntake as ProjectIntakeLike;
}

export async function repairMissingPdfAttachmentRequirements(
  db: DbClient,
  input: { projectId: string; intake?: ProjectIntakeLike | null }
) {
  if (!shouldRunRequirementsRepair()) {
    return { repaired: false, requirements: getExistingRequirements(input.intake) } as const;
  }

  const logFailure = (stage: string, error: unknown) => {
    console.warn(`[project-requirements-repair] ${stage} for project ${input.projectId}`, error);
  };
  const currentIntake = (input.intake || {}) as Record<string, unknown>;
  const existingRequirements = getExistingRequirements(input.intake);

  if (hasAttachmentDerivedRequirements(existingRequirements)) {
    return { repaired: false, requirements: existingRequirements } as const;
  }

  const { data: attachmentDocuments, error: documentsError } = await db
    .from("project_documents")
    .select("title, type, mime_type, storage_path, created_at")
    .eq("project_id", input.projectId)
    .in("type", ["prd_pdf", "image"])
    .order("created_at", { ascending: true });

  if (documentsError || !attachmentDocuments?.length) {
    return { repaired: false, requirements: existingRequirements } as const;
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
    return { repaired: false, requirements: existingRequirements } as const;
  }

  const nextRequirements = deriveProjectRequirements({
    intakeSummary: typeof currentIntake.summary === "string" ? currentIntake.summary : null,
    intakeGoals: typeof currentIntake.goals === "string" ? currentIntake.goals : null,
    existing: existingRequirements,
    documents: extractedDocuments,
  });

  if (!hasAttachmentDerivedRequirements(nextRequirements)) {
    return { repaired: false, requirements: existingRequirements } as const;
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
    return { repaired: false, requirements: existingRequirements } as const;
  }

  return { repaired: true, requirements: nextRequirements, intake: nextIntake } as const;
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
  const repaired = await repairMissingPdfAttachmentRequirements(db, {
    projectId: input.projectId,
    intake: input.intake || null,
  });

  const effectiveIntake = (repaired.intake || input.intake || {}) as ProjectIntakeLike;
  const effectiveRequirements = repaired.requirements || getExistingRequirements(effectiveIntake);
  if (!hasAttachmentDerivedRequirements(effectiveRequirements)) {
    return {
      recovered: false,
      repaired: repaired.repaired,
      requirements: effectiveRequirements,
      intake: effectiveIntake,
    } as const;
  }

  const nextIntake = buildAttachmentKickoffReadyIntake(effectiveIntake as Record<string, unknown>);
  const detail = input.errorDetail || "Attachment upload can be recovered from stored files. Finalization will continue from the saved attachment.";
  const recoveredIntake = buildAttachmentKickoffStageState(nextIntake as Record<string, unknown>, "requirements_ready", {
    detail,
    fileCount: input.fileCount,
  });
  const { error: updateError } = await db
    .from("projects")
    .update({
      intake: recoveredIntake,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.projectId);

  if (updateError) {
    throw new Error(updateError.message || "Failed to persist recoverable attachment upload state");
  }

  return {
    recovered: true,
    repaired: repaired.repaired,
    requirements: effectiveRequirements,
    intake: recoveredIntake,
  } as const;
}

export async function reconcileAttachmentBackedProjectCreate(
  db: DbClient,
  input: {
    project: {
      id: string;
      name?: string | null;
      type?: string | null;
      team_id?: string | null;
      intake?: any;
      links?: Record<string, string> | null;
      github_repo_binding?: any;
    };
  }
) {
  const project = input.project;
  const shouldAttemptRecovery = shouldAttemptAttachmentRecovery(project.intake || null);
  const repaired = shouldAttemptRecovery
    ? await repairMissingPdfAttachmentRequirements(db, {
        projectId: project.id,
        intake: project.intake || null,
      })
    : ({ repaired: false, requirements: getExistingRequirements(project.intake || null), intake: project.intake || null } as const);

  const effectiveIntake = repaired.intake || project.intake || null;
  const effectiveRequirements = repaired.requirements || getExistingRequirements(effectiveIntake);
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

  let finalized = false;
  let resolvedIntake = effectiveIntake as ProjectIntakeLike | null;
  if (shouldAttemptRecovery && ((sprintCount ?? 0) === 0 || hasLegacyAttachmentShell) && attachmentRequirementsReady) {
    if (hasLegacyAttachmentShell && sprintRows?.length) {
      const sprintIds = sprintRows.map((sprint: { id: string }) => sprint.id).filter(Boolean);
      if (sprintIds.length > 0) {
        const { error: deleteTasksError } = await db.from("sprint_items").delete().in("sprint_id", sprintIds);
        if (deleteTasksError) throw new Error(deleteTasksError.message);
        const { error: deleteSprintsError } = await db.from("sprints").delete().in("id", sprintIds);
        if (deleteSprintsError) throw new Error(deleteSprintsError.message);
      }
    }

    resolvedIntake = buildAttachmentKickoffFinalizedIntake(effectiveIntake as ProjectIntake) as ProjectIntakeLike;

    const { error: persistFinalizeError } = await db
      .from("projects")
      .update({
        intake: resolvedIntake,
        updated_at: new Date().toISOString(),
      })
      .eq("id", project.id);

    if (persistFinalizeError) {
      throw new Error(persistFinalizeError.message || "Failed to persist finalized attachment kickoff state");
    }

    await finalizeProjectCreate(db as any, {
      project: {
        ...project,
        intake: resolvedIntake as any,
      },
      name: project.name || "Untitled project",
      type: project.type || "other",
      intake: resolvedIntake as any,
      links: project.links || null,
      githubRepoBinding: project.github_repo_binding || null,
      teamId: project.team_id || null,
    });
    finalized = true;
  } else if (shouldAttemptRecovery && !attachmentRequirementsReady) {
    resolvedIntake = await persistAttachmentRecoveryFailure(
      db,
      project.id,
      effectiveIntake,
      "Attachment processing stopped before requirements could be derived. Re-upload the file or retry attachment processing.",
    );
  }

  return {
    repaired: repaired.repaired,
    finalized,
    attachmentRequirementsReady,
    project: {
      ...project,
      intake: resolvedIntake as any,
    },
  } as const;
}

import { buildAttachmentKickoffFinalizedIntake, hasAttachmentDerivedRequirements, isAttachmentKickoffShellSprint } from "@/lib/project-attachment-finalize";
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
};

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

  const { data: pdfDocuments, error: documentsError } = await db
    .from("project_documents")
    .select("title, type, mime_type, storage_path, created_at")
    .eq("project_id", input.projectId)
    .eq("type", "prd_pdf")
    .order("created_at", { ascending: true });

  if (documentsError || !pdfDocuments?.length) {
    return { repaired: false, requirements: existingRequirements } as const;
  }

  const extractedDocuments: Array<{ title: string; type: string; text?: string | null }> = [];
  for (const document of pdfDocuments) {
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
  const repaired = await repairMissingPdfAttachmentRequirements(db, {
    projectId: project.id,
    intake: project.intake || null,
  });

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

  const hasAttachmentKickoffShell = (sprintCount ?? 0) > 0 && (sprintRows || []).every((sprint: { name?: string | null }) => isAttachmentKickoffShellSprint(sprint));

  let finalized = false;
  if (((sprintCount ?? 0) === 0 || hasAttachmentKickoffShell) && attachmentRequirementsReady) {
    if (hasAttachmentKickoffShell && sprintRows?.length) {
      const sprintIds = sprintRows.map((sprint: { id: string }) => sprint.id).filter(Boolean);
      if (sprintIds.length > 0) {
        const { error: deleteTasksError } = await db.from("sprint_items").delete().in("sprint_id", sprintIds);
        if (deleteTasksError) throw new Error(deleteTasksError.message);
        const { error: deleteSprintsError } = await db.from("sprints").delete().in("id", sprintIds);
        if (deleteSprintsError) throw new Error(deleteSprintsError.message);
      }
    }

    await finalizeProjectCreate(db as any, {
      project: {
        ...project,
        intake: effectiveIntake as any,
      },
      name: project.name || "Untitled project",
      type: project.type || "other",
      intake: buildAttachmentKickoffFinalizedIntake(effectiveIntake as any) as any,
      links: project.links || null,
      githubRepoBinding: project.github_repo_binding || null,
      teamId: project.team_id || null,
    });
    finalized = true;
  }

  return {
    repaired: repaired.repaired,
    finalized,
    attachmentRequirementsReady,
    project: {
      ...project,
      intake: effectiveIntake as any,
    },
  } as const;
}

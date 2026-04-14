import { finalizeProjectCreate } from "@/lib/project-create-finalize";
import { deriveProjectRequirements, extractRequirementsFromUploadedFile } from "@/lib/project-requirements";
import { repairMissingPdfAttachmentRequirements } from "@/lib/project-requirements-repair";
import type { ProjectRequirements } from "@/lib/project-requirements.types";
import { buildAttachmentKickoffFinalizedIntake, buildAttachmentKickoffReadyIntake, buildAttachmentKickoffStageState, getAttachmentKickoffState, hasAttachmentDerivedRequirements, isAttachmentKickoffShellSprint, shouldFinalizeProjectAfterAttachmentUpload } from "@/lib/project-attachment-finalize";
import { syncProjectPreBuildCheckpoint } from "@/lib/pre-build-checkpoint";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

const STORAGE_BUCKET = "project_docs";

function storageNotConfiguredMessage() {
  return "Storage not configured: create bucket project_docs (private). Supabase Dashboard → Storage → New bucket → name: project_docs → set Private.";
}

type ProjectDb = NonNullable<ReturnType<typeof createRouteHandlerClient>>;

async function persistAttachmentKickoffStage(db: ProjectDb, projectId: string, intake: Record<string, unknown> | null | undefined, status: any, extras?: Record<string, unknown>) {
  const nextIntake = buildAttachmentKickoffStageState(intake, status, extras);
  const { error } = await db
    .from("projects")
    .update({
      intake: nextIntake,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) throw new Error(error.message || `Failed to persist attachment stage ${status}`);
  return nextIntake;
}

async function projectExists(db: ProjectDb, projectId: string) {
  const { data, error } = await db.from("projects").select("id").eq("id", projectId).single();
  return !error && Boolean(data?.id);
}

function getDocumentType(file: File) {
  if (file.type === "application/pdf") return "prd_pdf";
  if (file.type.startsWith("image/")) return "image";
  return "other";
}

function buildObjectName(projectId: string, originalName: string) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const hasExtension = safeName.includes(".");
  const ext = hasExtension ? safeName.split(".").pop() : "bin";
  return `${projectId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
}

function getStorageErrorMessage(error: { message?: string; statusCode?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() || "";
  const statusCode = error?.statusCode || "";

  if (statusCode === "404" || message.includes("bucket") || message.includes("not found")) {
    return storageNotConfiguredMessage();
  }

  return error?.message || "Failed to upload project documents";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const params = await ctx.params;

  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const projectId = params.id;
    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    if (!(await projectExists(db, projectId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const uploadedPaths: string[] = [];

    try {
      const documents = [] as Array<{
        project_id: string;
        type: string;
        title: string;
        storage_path: string;
        mime_type: string | null;
        size_bytes: number;
      }>;
      const extractedDocuments: Array<{ title: string; type: string; text?: string | null }> = [];

      const { data: project } = await db.from("projects").select("intake").eq("id", projectId).maybeSingle();
      let currentIntake = (project?.intake || {}) as Record<string, unknown>;
      currentIntake = await persistAttachmentKickoffStage(db, projectId, currentIntake, "upload_received", { fileCount: files.length });

      for (const file of files) {
        const objectName = buildObjectName(projectId, file.name || "upload.bin");
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const documentType = getDocumentType(file);
        const { error: uploadError } = await db.storage
          .from(STORAGE_BUCKET)
          .upload(objectName, buffer, {
            contentType: file.type || undefined,
            upsert: false,
          });

        if (uploadError) {
          return NextResponse.json({ error: getStorageErrorMessage(uploadError) }, { status: 500 });
        }

        uploadedPaths.push(objectName);
        documents.push({
          project_id: projectId,
          type: documentType,
          title: file.name || "Untitled upload",
          storage_path: objectName,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        currentIntake = await persistAttachmentKickoffStage(db, projectId, currentIntake, "extracting_attachment_text", { fileCount: files.length, currentFileName: file.name || "Untitled upload" });
        extractedDocuments.push(await extractRequirementsFromUploadedFile({
          buffer,
          mimeType: file.type || null,
          title: file.name || "Untitled upload",
          type: documentType,
        }));
      }

      const { data, error } = await db.from("project_documents").insert(documents).select();
      if (error) {
        await db.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      currentIntake = await persistAttachmentKickoffStage(db, projectId, currentIntake, "deriving_requirements", { fileCount: files.length });
      const nextRequirements = deriveProjectRequirements({
        intakeSummary: typeof currentIntake.summary === "string" ? currentIntake.summary : null,
        intakeGoals: typeof currentIntake.goals === "string" ? currentIntake.goals : null,
        existing: (currentIntake.requirements as any) || null,
        documents: extractedDocuments,
      });

      const nextIntake = {
        ...currentIntake,
        requirements: nextRequirements,
      };

      const { data: updatedProject, error: updateError } = await db
        .from("projects")
        .update({
          intake: nextIntake,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId)
        .select("id, name, type, team_id, intake, links, github_repo_binding")
        .single();

      if (updateError || !updatedProject) {
        throw new Error(updateError?.message || "Failed to persist attachment-derived requirements");
      }

      const repaired = await repairMissingPdfAttachmentRequirements(db, {
        projectId,
        intake: updatedProject.intake || nextIntake,
      });
      const effectiveIntake = repaired.intake || updatedProject.intake || nextIntake;
      const effectiveRequirements = repaired.requirements || (effectiveIntake.requirements as ProjectRequirements | null | undefined) || nextRequirements;
      const attachmentRequirementsReady = hasAttachmentDerivedRequirements(effectiveRequirements);

      const { count: sprintCount, error: sprintCountError } = await db
        .from("sprints")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);

      if (sprintCountError) {
        throw new Error(sprintCountError.message);
      }

      const { data: sprintRows, error: sprintRowsError } = await db
        .from("sprints")
        .select("id, name")
        .eq("project_id", projectId);

      if (sprintRowsError) {
        throw new Error(sprintRowsError.message);
      }

      const effectiveSprintCount = sprintCount ?? 0;
      const hasAttachmentKickoffShell = effectiveSprintCount > 0 && (sprintRows || []).every((sprint: { name?: string | null }) => isAttachmentKickoffShellSprint(sprint));

      const shouldFinalize = shouldFinalizeProjectAfterAttachmentUpload({
        sprintCount: effectiveSprintCount,
        attachmentRequirementsReady,
        hasAttachmentKickoffShell,
      });

      if (attachmentRequirementsReady) {
        currentIntake = await persistAttachmentKickoffStage(db, projectId, effectiveIntake as Record<string, unknown>, "requirements_ready", { fileCount: files.length });
      }

      const effectiveProjectForFinalize = {
        ...updatedProject,
        intake: attachmentRequirementsReady ? buildAttachmentKickoffReadyIntake(effectiveIntake) : effectiveIntake,
      };

      if (shouldFinalize && hasAttachmentKickoffShell && sprintRows?.length) {
        const sprintIds = sprintRows.map((sprint: { id: string }) => sprint.id).filter(Boolean);
        if (sprintIds.length > 0) {
          const { error: deleteTasksError } = await db.from("sprint_items").delete().in("sprint_id", sprintIds);
          if (deleteTasksError) throw new Error(deleteTasksError.message);
          const { error: deleteSprintsError } = await db.from("sprints").delete().in("id", sprintIds);
          if (deleteSprintsError) throw new Error(deleteSprintsError.message);
        }
      }

      if (shouldFinalize) {
        currentIntake = await persistAttachmentKickoffStage(db, projectId, effectiveProjectForFinalize.intake as Record<string, unknown>, "seeding_kickoff", { fileCount: files.length });
      }

      const dispatchResults = shouldFinalize
        ? await finalizeProjectCreate(db, {
            project: effectiveProjectForFinalize,
            name: updatedProject.name || "Untitled project",
            type: updatedProject.type || "other",
            intake: buildAttachmentKickoffFinalizedIntake(effectiveProjectForFinalize.intake),
            links: updatedProject.links || null,
            githubRepoBinding: updatedProject.github_repo_binding || null,
            teamId: updatedProject.team_id || null,
          })
        : [];

      const kickoffStartingIntake = shouldFinalize
        ? buildAttachmentKickoffStageState(effectiveProjectForFinalize.intake, "starting_work", { fileCount: files.length })
        : effectiveProjectForFinalize.intake;

      const persistedIntake = shouldFinalize
        ? buildAttachmentKickoffFinalizedIntake(kickoffStartingIntake)
        : attachmentRequirementsReady
          ? buildAttachmentKickoffReadyIntake(effectiveProjectForFinalize.intake)
          : effectiveProjectForFinalize.intake;

      const { error: persistKickoffStateError } = await db
        .from("projects")
        .update({
          intake: persistedIntake,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId);

      if (persistKickoffStateError) {
        throw new Error(persistKickoffStateError.message);
      }

      if ((shouldFinalize ? 1 : effectiveSprintCount) > 0) {
        await syncProjectPreBuildCheckpoint(db, {
          projectId,
          project: {
            ...updatedProject,
            intake: persistedIntake,
          },
        });
      }

      return NextResponse.json({
        documents: data,
        requirements: effectiveRequirements,
        dispatch: dispatchResults,
        intakeRequirementStatus: attachmentRequirementsReady ? "ready" : "missing_attachment_requirements",
        kickoffStatus: shouldFinalize
          ? "finalized"
          : effectiveSprintCount > 0
            ? "already_initialized"
            : "waiting_for_attachment_requirements",
        attachmentKickoffState: getAttachmentKickoffState(persistedIntake),
      }, { status: 201 });
    } catch (error) {
      try {
        const { data: project } = await db.from("projects").select("intake").eq("id", projectId).maybeSingle();
        await persistAttachmentKickoffStage(db, projectId, (project?.intake || {}) as Record<string, unknown>, "failed", {
          error: error instanceof Error ? error.message : "Attachment processing failed",
          detail: error instanceof Error ? error.message : "Attachment processing failed",
          fileCount: files.length,
        });
      } catch {}
      if (uploadedPaths.length > 0) {
        await db.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
      }
      throw error;
    }
  } catch (e: unknown) {
    console.error("[API /projects/:id/documents/upload] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

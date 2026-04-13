import { finalizeProjectCreate } from "@/lib/project-create-finalize";
import { deriveProjectRequirements, extractRequirementsFromUploadedFile } from "@/lib/project-requirements";
import { repairMissingPdfAttachmentRequirements } from "@/lib/project-requirements-repair";
import type { ProjectRequirements } from "@/lib/project-requirements.types";
import { shouldFinalizeProjectAfterAttachmentUpload } from "@/lib/project-attachment-finalize";
import { syncProjectPreBuildCheckpoint } from "@/lib/pre-build-checkpoint";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

const STORAGE_BUCKET = "project_docs";

function storageNotConfiguredMessage() {
  return "Storage not configured: create bucket project_docs (private). Supabase Dashboard → Storage → New bucket → name: project_docs → set Private.";
}

type ProjectDb = NonNullable<ReturnType<typeof createRouteHandlerClient>>;

function hasAttachmentDerivedRequirements(requirements: ProjectRequirements | null | undefined) {
  return Boolean(requirements?.sources?.some((source) => source?.type !== "intake" && Array.isArray(source.evidence) && source.evidence.length > 0));
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

      const { data: project } = await db.from("projects").select("intake").eq("id", projectId).maybeSingle();
      const currentIntake = (project?.intake || {}) as Record<string, unknown>;
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

      const effectiveSprintCount = sprintCount ?? 0;

      const shouldFinalize = shouldFinalizeProjectAfterAttachmentUpload({
        sprintCount: effectiveSprintCount,
        attachmentRequirementsReady,
      });

      const dispatchResults = shouldFinalize
        ? await finalizeProjectCreate(db, {
            project: {
              ...updatedProject,
              intake: effectiveIntake,
            },
            name: updatedProject.name || "Untitled project",
            type: updatedProject.type || "other",
            intake: effectiveIntake,
            links: updatedProject.links || null,
            githubRepoBinding: updatedProject.github_repo_binding || null,
            teamId: updatedProject.team_id || null,
          })
        : [];

      if (effectiveSprintCount > 0) {
        await syncProjectPreBuildCheckpoint(db, {
          projectId,
          project: {
            ...updatedProject,
            intake: effectiveIntake,
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
      }, { status: 201 });
    } catch (error) {
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

import { enqueueAttachmentProcessingJob, persistAttachmentQueuedState } from "@/lib/attachment-processing-jobs";
import { getAttachmentKickoffState } from "@/lib/project-attachment-finalize";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

const STORAGE_BUCKET = "project_docs";

function storageNotConfiguredMessage() {
  return "Storage not configured: create bucket project_docs (private). Supabase Dashboard → Storage → New bucket → name: project_docs → set Private.";
}

type ProjectDb = NonNullable<ReturnType<typeof createRouteHandlerClient>>;

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
    const persistedStoragePaths = new Set<string>();

    try {
      const insertedDocumentRows: Array<Record<string, unknown>> = [];
      const { data: project } = await db.from("projects").select("id, name, type, team_id, intake, links, github_repo_binding").eq("id", projectId).maybeSingle();
      let currentIntake = (project?.intake || {}) as Record<string, unknown>;

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
        const documentRecord = {
          project_id: projectId,
          type: documentType,
          title: file.name || "Untitled upload",
          storage_path: objectName,
          mime_type: file.type || null,
          size_bytes: file.size,
        };
        const { data: insertedDocument, error: insertDocumentError } = await db.from("project_documents").insert(documentRecord).select().single();
        if (insertDocumentError || !insertedDocument) {
          await db.storage.from(STORAGE_BUCKET).remove([objectName]);
          return NextResponse.json({ error: insertDocumentError?.message || "Failed to persist uploaded project document" }, { status: 500 });
        }

        persistedStoragePaths.add(objectName);
        insertedDocumentRows.push(insertedDocument);
      }

      currentIntake = await persistAttachmentQueuedState(db, {
        projectId,
        intake: currentIntake,
        fileCount: files.length,
      });
      const queuedJob = await enqueueAttachmentProcessingJob(db, {
        projectId,
        projectName: project?.name || null,
        fileCount: files.length,
      });
      const attachmentKickoffState = getAttachmentKickoffState(currentIntake);

      return NextResponse.json({
        documents: insertedDocumentRows,
        requirements: null,
        dispatch: [],
        intakeRequirementStatus: "queued_for_worker_processing",
        kickoffStatus: "queued_for_worker_processing",
        attachmentKickoffState,
        attachmentJob: queuedJob,
      }, { status: 201 });
    } catch (error) {
      try {
        const { data: project } = await db.from("projects").select("id, intake").eq("id", projectId).maybeSingle();
        if (persistedStoragePaths.size > 0) {
          await persistAttachmentQueuedState(db, {
            projectId,
            intake: (project?.intake || {}) as Record<string, unknown>,
            fileCount: files.length,
          });
        }
      } catch {}
      const transientUploads = uploadedPaths.filter((path) => !persistedStoragePaths.has(path));
      if (transientUploads.length > 0) {
        await db.storage.from(STORAGE_BUCKET).remove(transientUploads);
      }
      throw error;
    }
  } catch (e: unknown) {
    console.error("[API /projects/:id/documents/upload] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

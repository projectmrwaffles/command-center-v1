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

    try {
      const documents = [] as Array<{
        project_id: string;
        type: string;
        title: string;
        storage_path: string;
        mime_type: string | null;
        size_bytes: number;
      }>;

      for (const file of files) {
        const objectName = buildObjectName(projectId, file.name || "upload.bin");
        const arrayBuffer = await file.arrayBuffer();
        const { error: uploadError } = await db.storage
          .from(STORAGE_BUCKET)
          .upload(objectName, Buffer.from(arrayBuffer), {
            contentType: file.type || undefined,
            upsert: false,
          });

        if (uploadError) {
          return NextResponse.json({ error: getStorageErrorMessage(uploadError) }, { status: 500 });
        }

        uploadedPaths.push(objectName);
        documents.push({
          project_id: projectId,
          type: getDocumentType(file),
          title: file.name || "Untitled upload",
          storage_path: objectName,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
      }

      const { data, error } = await db.from("project_documents").insert(documents).select();
      if (error) {
        await db.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ documents: data }, { status: 201 });
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

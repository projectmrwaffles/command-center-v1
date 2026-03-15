import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

function normalizeDocumentType(value: string) {
  switch (value) {
    case "prd_pdf":
    case "image":
    case "link":
    case "other":
      return value;
    case "brief":
    case "doc":
    case "markdown":
    case "spec":
    case "text":
      return "other";
    case "pdf":
    case "prd":
      return "prd_pdf";
    default:
      return "other";
  }
}

type ProjectDb = NonNullable<ReturnType<typeof createRouteHandlerClient>>;

type DocumentInput = {
  type?: unknown;
  title?: unknown;
  storage_path?: unknown;
  mime_type?: unknown;
  size_bytes?: unknown;
};

async function projectExists(db: ProjectDb, projectId: string) {
  const { data, error } = await db.from("projects").select("id").eq("id", projectId).single();
  return !error && Boolean(data?.id);
}

function sanitizeDocuments(documents: DocumentInput[]) {
  return documents.map((document, index) => {
    const title = typeof document.title === "string" ? document.title.trim() : "";
    const storagePath = typeof document.storage_path === "string" ? document.storage_path.trim() : "";
    const mimeType = typeof document.mime_type === "string" ? document.mime_type.trim() : "";
    const typeValue = typeof document.type === "string" ? document.type : "other";
    const sizeBytes = Number(document.size_bytes ?? 0);

    if (!title) {
      throw new Error(`Document ${index + 1}: title is required`);
    }
    if (!storagePath) {
      throw new Error(`Document ${index + 1}: storage_path is required`);
    }
    if (!mimeType) {
      throw new Error(`Document ${index + 1}: mime_type is required`);
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
      throw new Error(`Document ${index + 1}: size_bytes must be a non-negative number`);
    }

    return {
      type: normalizeDocumentType(typeValue),
      title,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    };
  });
}

export async function GET(
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

    const { data, error } = await db
      .from("project_documents")
      .select("id, type, title, url, storage_path, mime_type, size_bytes, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[API /projects/:id/documents GET] error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ documents: data ?? [] });
  } catch (e: unknown) {
    console.error("[API /projects/:id/documents GET] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    const body = await req.json();
    const { documents } = body;

    if (!projectId || !Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    if (!(await projectExists(db, projectId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    let sanitizedDocuments;
    try {
      sanitizedDocuments = sanitizeDocuments(documents as DocumentInput[]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Invalid document payload";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { data, error } = await db
      .from("project_documents")
      .insert(
        sanitizedDocuments.map((document) => ({
          project_id: projectId,
          ...document,
        }))
      )
      .select();

    if (error) {
      console.error("[API /projects/:id/documents] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ documents: data }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects/:id/documents] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

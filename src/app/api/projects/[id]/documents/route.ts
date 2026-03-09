import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const params = await ctx.params;
  try {
    const projectId = params.id;
    const body = await req.json();
    const { documents } = body;

    if (!projectId || !documents || !Array.isArray(documents)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    interface DocumentInput {
  type: string;
  title: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
}

const { data, error } = await db
      .from("project_documents")
      .insert(
        documents.map((d: DocumentInput) => ({
          project_id: projectId,
          type: d.type,
          title: d.title,
          storage_path: d.storage_path,
          mime_type: d.mime_type,
          size_bytes: d.size_bytes,
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

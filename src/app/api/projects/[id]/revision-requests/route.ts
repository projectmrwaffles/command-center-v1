import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const { id: projectId } = await ctx.params;
    const body = await req.json();
    const sprintId = typeof body?.sprintId === "string" && body.sprintId.trim() ? body.sprintId.trim() : null;
    const message = typeof body?.message === "string" && body.message.trim() ? body.message.trim() : null;
    const attachmentDocumentIds = Array.isArray(body?.attachmentDocumentIds)
      ? body.attachmentDocumentIds.filter((value: unknown) => typeof value === "string" && value.trim().length > 0)
      : [];

    if (!projectId) return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    if (!message) return NextResponse.json({ error: "Revision request message is required" }, { status: 400 });
    if (!sprintId) return NextResponse.json({ error: "Milestone ID required" }, { status: 400 });

    const db = createRouteHandlerClient();
    if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const [{ data: project, error: projectError }, { data: sprint, error: sprintError }] = await Promise.all([
      db.from("projects").select("id,name").eq("id", projectId).maybeSingle(),
      db.from("sprints").select("id,name").eq("id", sprintId).eq("project_id", projectId).maybeSingle(),
    ]);

    if (projectError || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (sprintError || !sprint) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

    const { data: activeSubmission } = await db
      .from("milestone_submissions")
      .select("id,revision_number")
      .eq("sprint_id", sprintId)
      .eq("checkpoint_type", "delivery_review")
      .in("status", ["submitted", "under_review", "changes_requested"])
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeSubmission?.id) {
      return NextResponse.json({ error: "No active delivery submission found for this milestone" }, { status: 409 });
    }

    const normalizedAttachments: Array<{ documentId: string; title: string; storagePath: string | null; mimeType: string | null; sizeBytes: number | null }> = [];
    if (attachmentDocumentIds.length > 0) {
      const { data: docs, error: docsError } = await db
        .from("project_documents")
        .select("id,title,storage_path,mime_type,size_bytes")
        .eq("project_id", projectId)
        .in("id", attachmentDocumentIds);
      if (docsError) return NextResponse.json({ error: docsError.message || "Failed to load revision attachments" }, { status: 500 });
      for (const doc of docs || []) {
        normalizedAttachments.push({
          documentId: doc.id,
          title: doc.title || "Attachment",
          storagePath: doc.storage_path || null,
          mimeType: doc.mime_type || null,
          sizeBytes: doc.size_bytes ?? null,
        });
      }
    }

    const now = new Date().toISOString();
    const noteLines = [message];
    if (normalizedAttachments.length > 0) {
      noteLines.push("", "Attachments:");
      for (const attachment of normalizedAttachments) {
        noteLines.push(`- ${attachment.title}${attachment.storagePath ? ` (${attachment.storagePath})` : ""}`);
      }
    }

    const { error: submissionError } = await db
      .from("milestone_submissions")
      .update({
        status: "changes_requested",
        decision: "request_changes",
        decision_notes: message,
        rejection_comment: message,
        decided_at: now,
        updated_at: now,
      })
      .eq("id", activeSubmission.id);
    if (submissionError) return NextResponse.json({ error: submissionError.message || "Failed to store revision request" }, { status: 500 });

    const feedbackRows = [
      {
        submission_id: activeSubmission.id,
        feedback_type: "required",
        body: noteLines.join("\n"),
      },
      ...normalizedAttachments.map((attachment) => ({
        submission_id: activeSubmission.id,
        feedback_type: "required",
        body: `Attachment: ${attachment.title}${attachment.storagePath ? `\nStorage: ${attachment.storagePath}` : ""}`,
      })),
    ];

    const { error: feedbackError } = await db.from("submission_feedback_items").insert(feedbackRows);
    if (feedbackError) return NextResponse.json({ error: feedbackError.message || "Failed to persist revision notes" }, { status: 500 });

    await db.from("sprints").update({ delivery_review_status: "rejected", updated_at: now }).eq("id", sprintId).eq("project_id", projectId);
    await db.from("sprint_items").update({ review_status: "revision_requested", status: "todo", updated_at: now }).eq("project_id", projectId).eq("sprint_id", sprintId).eq("review_required", true);

    await db.from("agent_events").insert({
      agent_id: null,
      project_id: projectId,
      event_type: "revision_request_submitted",
      payload: {
        submission_id: activeSubmission.id,
        sprint_id: sprintId,
        sprint_name: sprint.name,
        revision_number: activeSubmission.revision_number,
        message,
        attachment_count: normalizedAttachments.length,
        attachments: normalizedAttachments,
      },
    });

    return NextResponse.json({ ok: true, submissionId: activeSubmission.id, attachmentCount: normalizedAttachments.length }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects/:id/revision-requests] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { buildReviewEventPayload, isFeedbackType } from "@/lib/milestone-review";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; milestoneId: string }> }) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const { id: projectId, milestoneId } = await ctx.params;
    const body = await req.json();
    const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
    const decisionNotes = typeof body?.decisionNotes === "string" ? body.decisionNotes.trim() || null : null;
    const feedbackItems = Array.isArray(body?.feedbackItems) ? body.feedbackItems : [];

    const normalized = feedbackItems
      .filter((item: unknown) => {
        const candidate = item as { feedbackType?: unknown; body?: unknown };
        return isFeedbackType(candidate?.feedbackType) && typeof candidate?.body === "string" && candidate.body.trim().length > 0;
      })
      .map((item: unknown) => {
        const candidate = item as { feedbackType: string; body: string };
        return { feedbackType: candidate.feedbackType, body: candidate.body.trim() };
      });

    if (!submissionId) return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
    if (!normalized.some((item: { feedbackType: string; body: string }) => item.feedbackType === "required" || item.feedbackType === "blocker")) {
      return NextResponse.json({ error: "At least one required or blocker feedback item is required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const { data: submission, error: submissionError } = await db
      .from("milestone_submissions")
      .select("id, sprint_id, revision_number, status, approval_id, summary")
      .eq("id", submissionId)
      .eq("sprint_id", milestoneId)
      .single();

    if (submissionError || !submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    if (!["submitted", "under_review"].includes(submission.status)) {
      return NextResponse.json({ error: "Only active review submissions can request changes" }, { status: 409 });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await db
      .from("milestone_submissions")
      .update({
        status: "changes_requested",
        decision: "request_changes",
        decision_notes: decisionNotes,
        decided_at: now,
        updated_at: now,
      })
      .eq("id", submissionId)
      .eq("sprint_id", milestoneId);

    if (updateError) return NextResponse.json({ error: updateError.message || "Failed to update submission" }, { status: 500 });

    const { error: feedbackError } = await db.from("submission_feedback_items").insert(
      normalized.map((item: { feedbackType: string; body: string }) => ({
        submission_id: submissionId,
        feedback_type: item.feedbackType,
        body: item.body,
      })),
    );

    if (feedbackError) return NextResponse.json({ error: feedbackError.message || "Failed to create feedback items" }, { status: 500 });

    await db.from("sprints").update({ approval_gate_status: "rejected", updated_at: now }).eq("id", milestoneId).eq("project_id", projectId);

    if (submission.approval_id) {
      await db.from("approvals").update({ status: "changes_requested", note: decisionNotes, decided_at: now }).eq("id", submission.approval_id);
    }

    await db.from("sprint_items").update({ review_status: "revision_requested", status: "todo", updated_at: now }).eq("project_id", projectId).eq("sprint_id", milestoneId).eq("review_required", true);

    await db.from("agent_events").insert({
      agent_id: null,
      project_id: projectId,
      event_type: "milestone_changes_requested",
      payload: buildReviewEventPayload({
        submissionId,
        sprintId: milestoneId,
        revisionNumber: submission.revision_number,
        summary: submission.summary,
        decision: "request_changes",
        note: decisionNotes,
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[API /projects/:id/milestones/:milestoneId/request-changes] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { buildReviewEventPayload } from "@/lib/milestone-review";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; milestoneId: string }> }) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const { id: projectId, milestoneId } = await ctx.params;
    const body = await req.json();
    const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
    const note = typeof body?.note === "string" ? body.note.trim() || null : null;

    if (!submissionId) return NextResponse.json({ error: "submissionId is required" }, { status: 400 });

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
      return NextResponse.json({ error: "Only active review submissions can be approved" }, { status: 409 });
    }

    const { data: proofBundle, error: bundleError } = await db
      .from("proof_bundles")
      .select("id, completeness_status")
      .eq("submission_id", submissionId)
      .single();

    if (bundleError || !proofBundle) return NextResponse.json({ error: "Proof bundle not found" }, { status: 404 });
    if (proofBundle.completeness_status !== "ready") {
      return NextResponse.json({ error: "Proof bundle must be ready before approval" }, { status: 409 });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await db
      .from("milestone_submissions")
      .update({
        status: "approved",
        decision: "approve",
        decision_notes: note,
        decided_at: now,
        updated_at: now,
      })
      .eq("id", submissionId)
      .eq("sprint_id", milestoneId);

    if (updateError) return NextResponse.json({ error: updateError.message || "Failed to approve submission" }, { status: 500 });

    await db.from("sprints").update({ approval_gate_status: "approved", updated_at: now }).eq("id", milestoneId).eq("project_id", projectId);

    if (submission.approval_id) {
      await db.from("approvals").update({ status: "approved", note, decided_at: now }).eq("id", submission.approval_id);
    }

    await db.from("sprint_items").update({ review_status: "approved", status: "done", updated_at: now }).eq("project_id", projectId).eq("sprint_id", milestoneId).eq("review_required", true);

    await db.from("agent_events").insert({
      agent_id: null,
      project_id: projectId,
      event_type: "milestone_submission_approved",
      payload: buildReviewEventPayload({
        submissionId,
        sprintId: milestoneId,
        revisionNumber: submission.revision_number,
        summary: submission.summary,
        decision: "approve",
        note,
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[API /projects/:id/milestones/:milestoneId/approve] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

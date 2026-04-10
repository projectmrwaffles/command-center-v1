import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { buildReviewEventPayload, validateProofBundleRequirements } from "@/lib/milestone-review";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; milestoneId: string }> }) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const { id: projectId, milestoneId } = await ctx.params;
    const body = await req.json();
    const requestedSubmissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
    const note = typeof body?.note === "string" ? body.note.trim() || null : null;

    const db = createRouteHandlerClient();
    if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const { data: sprint, error: sprintError } = await db
      .from("sprints")
      .select("id, project_id, name, approval_gate_status")
      .eq("id", milestoneId)
      .eq("project_id", projectId)
      .single();

    if (sprintError || !sprint) return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });

    let submissionId = requestedSubmissionId;
    let submission: {
      id: string;
      sprint_id: string;
      revision_number: number;
      status: string;
      approval_id: string | null;
      summary: string | null;
      checkpoint_type: string | null;
      evidence_requirements: unknown;
    } | null = null;

    if (submissionId) {
      const { data, error } = await db
        .from("milestone_submissions")
        .select("id, sprint_id, revision_number, status, approval_id, summary, checkpoint_type, evidence_requirements")
        .eq("id", submissionId)
        .eq("sprint_id", milestoneId)
        .single();

      if (error || !data) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
      submission = data;
    } else {
      const { data } = await db
        .from("milestone_submissions")
        .select("id, sprint_id, revision_number, status, approval_id, summary, checkpoint_type, evidence_requirements")
        .eq("sprint_id", milestoneId)
        .order("revision_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        submission = data;
        submissionId = data.id;
      }
    }

    const now = new Date().toISOString();

    if (submission) {
      if (!["submitted", "under_review"].includes(submission.status)) {
        return NextResponse.json({ error: "Only active review submissions can be approved" }, { status: 409 });
      }

      const { data: proofBundle, error: bundleError } = await db
        .from("proof_bundles")
        .select("id, completeness_status")
        .eq("submission_id", submissionId)
        .single();

      if (bundleError || !proofBundle) return NextResponse.json({ error: "Proof bundle not found" }, { status: 404 });

      const { data: proofItems, error: proofItemsError } = await db
        .from("proof_items")
        .select("kind")
        .eq("proof_bundle_id", proofBundle.id);
      if (proofBundle.completeness_status !== "ready") {
        return NextResponse.json({ error: "Proof bundle must be ready before approval" }, { status: 409 });
      }
      if (proofItemsError) return NextResponse.json({ error: proofItemsError.message || "Failed to inspect proof items" }, { status: 500 });
      const proofValidation = validateProofBundleRequirements({
        checkpointType: submission.checkpoint_type,
        evidenceRequirements: submission.evidence_requirements,
        items: proofItems || [],
      });
      if (!proofValidation.ok) {
        return NextResponse.json({ error: proofValidation.message, evidenceRequirements: proofValidation.requirements, screenshotCount: proofValidation.screenshotCount }, { status: 409 });
      }

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

      if (submission.approval_id) {
        await db.from("approvals").update({ status: "approved", note, decided_at: now }).eq("id", submission.approval_id);
      }

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
    } else {
      if (sprint.approval_gate_status !== "pending") {
        return NextResponse.json({ error: "Only pending checkpoints can be approved" }, { status: 409 });
      }

      await db.from("agent_events").insert({
        agent_id: null,
        project_id: projectId,
        event_type: "milestone_checkpoint_approved",
        payload: {
          sprint_id: milestoneId,
          sprint_name: sprint.name,
          decision: "approve",
          note,
        },
      });
    }

    await db.from("sprints").update({ approval_gate_status: "approved", updated_at: now }).eq("id", milestoneId).eq("project_id", projectId);

    await db.from("sprint_items").update({ review_status: "approved", status: "done", updated_at: now }).eq("project_id", projectId).eq("sprint_id", milestoneId).eq("review_required", true);

    return NextResponse.json({ ok: true, submissionId: submissionId || null });
  } catch (e: unknown) {
    console.error("[API /projects/:id/milestones/:milestoneId/approve] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

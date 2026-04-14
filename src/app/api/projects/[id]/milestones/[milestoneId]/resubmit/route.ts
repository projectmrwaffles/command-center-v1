import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { buildReviewEventPayload, computeProofBundleCompletenessStatus, deriveMilestoneEvidenceRequirements, isProofItemKind, resolveMilestoneCheckpointType, validateProofBundleRequirements } from "@/lib/milestone-review";
import { NextRequest, NextResponse } from "next/server";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; milestoneId: string }> }) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const { id: projectId, milestoneId } = await ctx.params;
    const body = await req.json();

    const priorSubmissionId = typeof body?.priorSubmissionId === "string" ? body.priorSubmissionId : "";
    const summary = body?.summary;
    const whatChanged = body?.whatChanged;
    const risks = typeof body?.risks === "string" ? body.risks.trim() || null : null;
    const proofBundle = body?.proofBundle;

    if (!priorSubmissionId || !isNonEmptyString(summary) || !isNonEmptyString(whatChanged)) {
      return NextResponse.json({ error: "priorSubmissionId, summary, and whatChanged are required" }, { status: 400 });
    }

    if (!proofBundle || !isNonEmptyString(proofBundle.title) || !Array.isArray(proofBundle.items) || proofBundle.items.length === 0) {
      return NextResponse.json({ error: "proofBundle with at least one item is required" }, { status: 400 });
    }

    const invalidProofItem = proofBundle.items.find((item: any) => !isProofItemKind(item?.kind) || !isNonEmptyString(item?.label));
    if (invalidProofItem) {
      return NextResponse.json({ error: "Each proof item requires a valid kind and label" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const [{ data: priorSubmission, error: priorError }, { data: sprint, error: sprintError }] = await Promise.all([
      db
        .from("milestone_submissions")
        .select("id, sprint_id, revision_number, status, summary, checkpoint_type, evidence_requirements, rejection_comment")
        .eq("id", priorSubmissionId)
        .eq("sprint_id", milestoneId)
        .single(),
      db.from("sprints").select("id, project_id, name, phase_key, checkpoint_type, checkpoint_evidence_requirements").eq("id", milestoneId).eq("project_id", projectId).single(),
    ]);

    if (priorError || !priorSubmission) return NextResponse.json({ error: "Prior submission not found" }, { status: 404 });
    if (sprintError || !sprint) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    if (priorSubmission.status !== "changes_requested") {
      return NextResponse.json({ error: "Only changes-requested submissions can be resubmitted" }, { status: 409 });
    }

    const nextRevision = (priorSubmission.revision_number || 0) + 1;
    const now = new Date().toISOString();
    const checkpointType = resolveMilestoneCheckpointType({
      checkpointType: sprint.checkpoint_type || priorSubmission.checkpoint_type,
      sprintName: sprint.name,
      phaseKey: sprint.phase_key,
    }) || sprint.checkpoint_type || priorSubmission.checkpoint_type || "delivery_review";
    const generatedEvidenceRequirements = deriveMilestoneEvidenceRequirements({
      checkpointType,
      explicitRequirements: sprint.checkpoint_evidence_requirements || priorSubmission.evidence_requirements,
      sprintName: sprint.name,
      phaseKey: sprint.phase_key,
    });

    const proofValidation = validateProofBundleRequirements({
      checkpointType: checkpointType,
      evidenceRequirements: generatedEvidenceRequirements,
      items: proofBundle.items,
    });
    if (!proofValidation.ok) {
      return NextResponse.json({ error: proofValidation.message, evidenceRequirements: proofValidation.requirements, screenshotCount: proofValidation.screenshotCount }, { status: 400 });
    }

    const { data: newSubmission, error: newSubmissionError } = await db
      .from("milestone_submissions")
      .insert({
        sprint_id: milestoneId,
        checkpoint_type: checkpointType,
        evidence_requirements: proofValidation.requirements,
        revision_number: nextRevision,
        summary: summary.trim(),
        what_changed: whatChanged.trim(),
        risks,
        status: "submitted",
      })
      .select()
      .single();

    if (newSubmissionError || !newSubmission) return NextResponse.json({ error: newSubmissionError?.message || "Failed to create new submission" }, { status: 500 });

    const { error: supersedeError } = await db
      .from("milestone_submissions")
      .update({ status: "superseded", superseded_by_submission_id: newSubmission.id, updated_at: now })
      .eq("id", priorSubmissionId)
      .eq("sprint_id", milestoneId);

    if (supersedeError) return NextResponse.json({ error: supersedeError.message || "Failed to supersede prior submission" }, { status: 500 });

    const { data: bundle, error: bundleError } = await db
      .from("proof_bundles")
      .insert({
        submission_id: newSubmission.id,
        title: proofBundle.title.trim(),
        summary: typeof proofBundle.summary === "string" ? proofBundle.summary.trim() || null : null,
        completeness_status: computeProofBundleCompletenessStatus({
          checkpointType,
          evidenceRequirements: generatedEvidenceRequirements,
          items: proofBundle.items,
        }),
      })
      .select()
      .single();

    if (bundleError || !bundle) return NextResponse.json({ error: bundleError?.message || "Failed to create proof bundle" }, { status: 500 });

    const { error: itemsError } = await db.from("proof_items").insert(
      proofBundle.items.map((item: any, index: number) => ({
        proof_bundle_id: bundle.id,
        kind: item.kind,
        label: item.label.trim(),
        url: isNonEmptyString(item.url) ? item.url.trim() : null,
        storage_path: isNonEmptyString(item.storagePath) ? item.storagePath.trim() : null,
        notes: isNonEmptyString(item.notes) ? item.notes.trim() : null,
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
        sort_order: typeof item.sortOrder === "number" ? item.sortOrder : index,
      })),
    );

    if (itemsError) return NextResponse.json({ error: itemsError.message || "Failed to create proof items" }, { status: 500 });

    await db.from("sprints").update({ approval_gate_status: "pending", updated_at: now }).eq("id", milestoneId).eq("project_id", projectId);
    await db.from("sprint_items").update({ review_status: "ready_for_rereview", status: "done", updated_at: now }).eq("project_id", projectId).eq("sprint_id", milestoneId).eq("review_required", true);

    await db.from("agent_events").insert({
      agent_id: null,
      project_id: projectId,
      event_type: "milestone_submission_resubmitted",
      payload: buildReviewEventPayload({
        submissionId: newSubmission.id,
        sprintId: milestoneId,
        revisionNumber: nextRevision,
        summary: summary.trim(),
      }),
    });

    return NextResponse.json({ submission: newSubmission, proofBundle: bundle }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects/:id/milestones/:milestoneId/resubmit] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

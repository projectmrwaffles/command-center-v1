import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { buildReviewEventPayload, isProofItemKind } from "@/lib/milestone-review";
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

    if (!projectId || !milestoneId) {
      return NextResponse.json({ error: "Project ID and milestone ID required" }, { status: 400 });
    }

    const summary = body?.summary;
    const whatChanged = body?.whatChanged;
    const risks = typeof body?.risks === "string" ? body.risks.trim() || null : null;
    const proofBundle = body?.proofBundle;

    if (!isNonEmptyString(summary) || !isNonEmptyString(whatChanged)) {
      return NextResponse.json({ error: "summary and whatChanged are required" }, { status: 400 });
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

    const [{ data: sprint, error: sprintError }, { data: activeSubmission, error: activeSubmissionError }] = await Promise.all([
      db.from("sprints").select("id, project_id, name, approval_gate_required").eq("id", milestoneId).eq("project_id", projectId).single(),
      db.from("milestone_submissions").select("id, status").eq("sprint_id", milestoneId).in("status", ["submitted", "under_review"]).maybeSingle(),
    ]);

    if (sprintError || !sprint) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    if (activeSubmissionError) return NextResponse.json({ error: activeSubmissionError.message || "Failed to inspect milestone state" }, { status: 500 });
    if (activeSubmission?.id) return NextResponse.json({ error: "An active submission already exists for this milestone" }, { status: 409 });

    const { data: lastSubmission } = await db
      .from("milestone_submissions")
      .select("revision_number")
      .eq("sprint_id", milestoneId)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextRevision = (lastSubmission?.revision_number || 0) + 1;

    const { data: submission, error: submissionError } = await db
      .from("milestone_submissions")
      .insert({
        sprint_id: milestoneId,
        revision_number: nextRevision,
        summary: summary.trim(),
        what_changed: whatChanged.trim(),
        risks,
        status: "submitted",
      })
      .select()
      .single();

    if (submissionError || !submission) {
      return NextResponse.json({ error: submissionError?.message || "Failed to create submission" }, { status: 500 });
    }

    const completenessStatus = proofBundle.items.length > 0 ? "ready" : "incomplete";
    const { data: bundle, error: bundleError } = await db
      .from("proof_bundles")
      .insert({
        submission_id: submission.id,
        title: proofBundle.title.trim(),
        summary: typeof proofBundle.summary === "string" ? proofBundle.summary.trim() || null : null,
        completeness_status: completenessStatus,
      })
      .select()
      .single();

    if (bundleError || !bundle) {
      return NextResponse.json({ error: bundleError?.message || "Failed to create proof bundle" }, { status: 500 });
    }

    const proofItemsPayload = proofBundle.items.map((item: any, index: number) => ({
      proof_bundle_id: bundle.id,
      kind: item.kind,
      label: item.label.trim(),
      url: isNonEmptyString(item.url) ? item.url.trim() : null,
      storage_path: isNonEmptyString(item.storagePath) ? item.storagePath.trim() : null,
      notes: isNonEmptyString(item.notes) ? item.notes.trim() : null,
      metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
      sort_order: typeof item.sortOrder === "number" ? item.sortOrder : index,
    }));

    const { error: itemsError } = await db.from("proof_items").insert(proofItemsPayload);
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message || "Failed to create proof items" }, { status: 500 });
    }

    await db.from("sprints").update({ approval_gate_status: "pending", updated_at: new Date().toISOString() }).eq("id", milestoneId).eq("project_id", projectId);

    await db.from("agent_events").insert({
      agent_id: null,
      project_id: projectId,
      event_type: "milestone_submission_created",
      payload: buildReviewEventPayload({
        submissionId: submission.id,
        sprintId: milestoneId,
        revisionNumber: nextRevision,
        summary: summary.trim(),
      }),
    });

    return NextResponse.json({ submission, proofBundle: bundle }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects/:id/milestones/:milestoneId/submit] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

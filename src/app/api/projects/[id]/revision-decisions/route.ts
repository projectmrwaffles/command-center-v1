import { finalizeCheckpointApproval } from "@/lib/checkpoint-approval";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { redispatchReopenedSprintTasks, reopenProjectSprintForRevision } from "@/lib/revision-reopen";
import { NextRequest, NextResponse } from "next/server";

type RevisionDecisionAction = "select_direction" | "request_another_pass" | "approve_for_implementation";

function isUniqueRevisionError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message || "";
  return error?.code === "23505" && message.includes("milestone_submissions_revision_unique");
}

async function createRevisionRequestSubmission(db: NonNullable<ReturnType<typeof createRouteHandlerClient>>, input: {
  sprintId: string;
  sprintName: string;
  message: string;
  now: string;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: latestSubmission, error: latestSubmissionError } = await db
      .from("milestone_submissions")
      .select("revision_number")
      .eq("sprint_id", input.sprintId)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSubmissionError) throw new Error(latestSubmissionError.message || "Failed to load delivery review history");

    const { data: createdSubmission, error: createSubmissionError } = await db
      .from("milestone_submissions")
      .insert({
        sprint_id: input.sprintId,
        checkpoint_type: "delivery_review",
        revision_number: (latestSubmission?.revision_number || 0) + 1,
        summary: `Revision requested for ${input.sprintName}`,
        what_changed: input.message,
        status: "changes_requested",
        decision: "request_changes",
        decision_notes: input.message,
        rejection_comment: input.message,
        decided_at: input.now,
        updated_at: input.now,
      })
      .select("id,sprint_id,revision_number,status,summary,checkpoint_type,approval_id")
      .single();

    if (!createSubmissionError && createdSubmission) return createdSubmission;
    if (!isUniqueRevisionError(createSubmissionError)) {
      throw new Error(createSubmissionError?.message || "Failed to create revision request record");
    }
  }

  throw new Error("Failed to allocate a unique revision number for the revision request");
}

function normalizeAction(value: unknown): RevisionDecisionAction | null {
  return value === "select_direction" || value === "request_another_pass" || value === "approve_for_implementation"
    ? value
    : null;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildDecisionNotes(input: {
  selectedCandidateLabel?: string | null;
  notes?: string | null;
  requiresAnotherPass?: boolean;
  approvedForImplementation?: boolean;
}) {
  const lines = [
    input.selectedCandidateLabel ? `Selected direction: ${input.selectedCandidateLabel}` : "Direction selected.",
    input.approvedForImplementation ? "Approved for implementation." : null,
    input.requiresAnotherPass ? "Another design pass is required before implementation." : null,
    input.notes || null,
  ].filter(Boolean);

  return lines.join("\n\n") || null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const { id: projectId } = await ctx.params;
    const body = await req.json();
    const action = normalizeAction(body?.action);
    const sprintId = typeof body?.sprintId === "string" && body.sprintId.trim() ? body.sprintId.trim() : null;
    const submissionId = typeof body?.submissionId === "string" && body.submissionId.trim() ? body.submissionId.trim() : null;
    const selectedCandidateId = typeof body?.selectedCandidateId === "string" && body.selectedCandidateId.trim() ? body.selectedCandidateId.trim() : null;
    const notes = normalizeOptionalText(body?.notes);
    const requiresAnotherPass = body?.requiresAnotherPass === true;

    if (!projectId) return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    if (!action) return NextResponse.json({ error: "A supported revision decision action is required" }, { status: 400 });
    if (!sprintId) return NextResponse.json({ error: "Milestone ID required" }, { status: 400 });
    if (action === "request_another_pass" && !notes) {
      return NextResponse.json({ error: "Notes are required to request another pass" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const [{ data: project, error: projectError }, { data: sprint, error: sprintError }] = await Promise.all([
      db.from("projects").select("id,name").eq("id", projectId).maybeSingle(),
      db.from("sprints").select("id,name,phase_key,checkpoint_type,approval_gate_status,delivery_review_status").eq("id", sprintId).eq("project_id", projectId).maybeSingle(),
    ]);

    if (projectError || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (sprintError || !sprint) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

    const { data: latestSubmission, error: latestSubmissionError } = submissionId
      ? await db
        .from("milestone_submissions")
        .select("id,sprint_id,revision_number,status,summary,checkpoint_type,approval_id")
        .eq("id", submissionId)
        .eq("sprint_id", sprintId)
        .maybeSingle()
      : await db
        .from("milestone_submissions")
        .select("id,sprint_id,revision_number,status,summary,checkpoint_type,approval_id")
        .eq("sprint_id", sprintId)
        .order("revision_number", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (latestSubmissionError) {
      return NextResponse.json({ error: latestSubmissionError.message || "Failed to load milestone submission" }, { status: 500 });
    }

    const now = new Date().toISOString();

    if (action === "request_another_pass") {
      let activeSubmission = latestSubmission;
      if (!activeSubmission?.id) {
        activeSubmission = await createRevisionRequestSubmission(db, {
          sprintId,
          sprintName: sprint.name,
          message: notes!,
          now,
        });
      }
      if (!activeSubmission?.id) {
        return NextResponse.json({ error: "Failed to resolve the active revision submission" }, { status: 500 });
      }

      if (latestSubmission?.id === activeSubmission.id) {
        const { error: submissionError } = await db
          .from("milestone_submissions")
          .update({
            status: "changes_requested",
            decision: "request_changes",
            decision_notes: notes,
            rejection_comment: notes,
            decided_at: now,
            updated_at: now,
          })
          .eq("id", activeSubmission.id);
        if (submissionError) return NextResponse.json({ error: submissionError.message || "Failed to store another-pass request" }, { status: 500 });
      }

      const { error: feedbackError } = await db.from("submission_feedback_items").insert({
        submission_id: activeSubmission.id,
        feedback_type: "required",
        body: notes,
      });
      if (feedbackError) return NextResponse.json({ error: feedbackError.message || "Failed to persist another-pass notes" }, { status: 500 });

      await db.from("sprints").update({ delivery_review_required: true, delivery_review_status: "rejected", updated_at: now }).eq("id", sprintId).eq("project_id", projectId);
      await db.from("sprint_items").update({ review_status: "revision_requested", status: "todo", updated_at: now }).eq("project_id", projectId).eq("sprint_id", sprintId).eq("review_required", true);
      await reopenProjectSprintForRevision(db as any, { projectId, sprintId, now });
      const redispatchResults = await redispatchReopenedSprintTasks(db as any, { projectId, sprintId });

      await db.from("agent_events").insert({
        agent_id: null,
        project_id: projectId,
        event_type: "revision_another_pass_requested",
        payload: {
          sprint_id: sprintId,
          sprint_name: sprint.name,
          submission_id: activeSubmission.id,
          revision_number: activeSubmission.revision_number,
          notes,
          routed_to: "design_owner",
          redispatch_results: redispatchResults,
        },
      });

      return NextResponse.json({
        ok: true,
        action,
        submissionId: activeSubmission.id,
        state: "needs_revision",
        redispatchResults,
      }, { status: 201 });
    }

    if (!latestSubmission?.id) {
      return NextResponse.json({ error: "A submitted review set is required before taking this action" }, { status: 409 });
    }

    const { data: proofBundle, error: proofBundleError } = await db
      .from("proof_bundles")
      .select("id, completeness_status")
      .eq("submission_id", latestSubmission.id)
      .maybeSingle();
    if (proofBundleError) return NextResponse.json({ error: proofBundleError.message || "Failed to inspect proof bundle" }, { status: 500 });

    const { data: proofItems, error: proofItemsError } = proofBundle?.id
      ? await db.from("proof_items").select("id, kind, label, url, storage_path").eq("proof_bundle_id", proofBundle.id).order("sort_order", { ascending: true })
      : { data: [], error: null };
    if (proofItemsError) return NextResponse.json({ error: proofItemsError.message || "Failed to inspect proof items" }, { status: 500 });

    const selectedCandidate = selectedCandidateId
      ? (proofItems || []).find((item: any) => item.id === selectedCandidateId) || null
      : null;
    if (selectedCandidateId && !selectedCandidate) {
      return NextResponse.json({ error: "Selected candidate was not found on the latest submission" }, { status: 400 });
    }

    if (action === "select_direction") {
      const decisionNotes = buildDecisionNotes({
        selectedCandidateLabel: selectedCandidate?.label || null,
        notes,
        requiresAnotherPass,
      });

      const { error: updateError } = await db
        .from("milestone_submissions")
        .update({
          status: "changes_requested",
          decision: "request_changes",
          decision_notes: decisionNotes,
          rejection_comment: notes,
          decided_at: now,
          updated_at: now,
        })
        .eq("id", latestSubmission.id)
        .eq("sprint_id", sprintId);
      if (updateError) return NextResponse.json({ error: updateError.message || "Failed to record selected direction" }, { status: 500 });

      await db.from("sprints").update({ delivery_review_required: true, delivery_review_status: "rejected", updated_at: now }).eq("id", sprintId).eq("project_id", projectId);
      await db.from("sprint_items").update({ review_status: "revision_requested", status: "todo", updated_at: now }).eq("project_id", projectId).eq("sprint_id", sprintId).eq("review_required", true);
      await reopenProjectSprintForRevision(db as any, { projectId, sprintId, now });
      const redispatchResults: unknown[] = await redispatchReopenedSprintTasks(db as any, { projectId, sprintId });

      await db.from("submission_feedback_items").insert([
        {
          submission_id: latestSubmission.id,
          feedback_type: "required",
          body: selectedCandidate?.label ? `Direction selected: ${selectedCandidate.label}` : "Direction selected",
        },
        ...(notes ? [{ submission_id: latestSubmission.id, feedback_type: "optional", body: notes }] : []),
      ]);

      await db.from("agent_events").insert({
        agent_id: null,
        project_id: projectId,
        event_type: "revision_direction_selected",
        payload: {
          sprint_id: sprintId,
          sprint_name: sprint.name,
          submission_id: latestSubmission.id,
          revision_number: latestSubmission.revision_number,
          selected_candidate_id: selectedCandidate?.id || null,
          selected_candidate_label: selectedCandidate?.label || null,
          candidate_count: proofItems?.length || 0,
          notes,
          requires_another_pass: requiresAnotherPass,
          routed_to: "design_owner",
          redispatch_results: redispatchResults,
        },
      });

      return NextResponse.json({
        ok: true,
        action,
        submissionId: latestSubmission.id,
        state: "needs_revision",
        redispatchResults,
      });
    }

    if (!["submitted", "under_review"].includes(latestSubmission.status)) {
      return NextResponse.json({ error: "Only active review submissions can be approved for implementation" }, { status: 409 });
    }
    if (!proofBundle?.id || proofBundle.completeness_status !== "ready") {
      return NextResponse.json({ error: "Proof bundle must be ready before approval" }, { status: 409 });
    }

    const decisionNotes = buildDecisionNotes({
      selectedCandidateLabel: selectedCandidate?.label || null,
      notes,
      approvedForImplementation: true,
    });

    const { error: approveError } = await db
      .from("milestone_submissions")
      .update({
        status: "approved",
        decision: "approve",
        decision_notes: decisionNotes,
        decided_at: now,
        updated_at: now,
      })
      .eq("id", latestSubmission.id)
      .eq("sprint_id", sprintId);
    if (approveError) return NextResponse.json({ error: approveError.message || "Failed to approve submission" }, { status: 500 });

    if (latestSubmission.approval_id) {
      await db.from("approvals").update({ status: "approved", note: decisionNotes, decided_at: now }).eq("id", latestSubmission.approval_id);
    }

    await db.from("submission_feedback_items").insert([
      {
        submission_id: latestSubmission.id,
        feedback_type: "required",
        body: selectedCandidate?.label ? `Approved for implementation: ${selectedCandidate.label}` : "Approved for implementation",
      },
      ...(notes ? [{ submission_id: latestSubmission.id, feedback_type: "optional", body: notes }] : []),
    ]);

    await db.from("agent_events").insert({
      agent_id: null,
      project_id: projectId,
      event_type: "revision_approved_for_implementation",
      payload: {
        sprint_id: sprintId,
        sprint_name: sprint.name,
        submission_id: latestSubmission.id,
        revision_number: latestSubmission.revision_number,
        selected_candidate_id: selectedCandidate?.id || null,
        selected_candidate_label: selectedCandidate?.label || null,
        candidate_count: proofItems?.length || 0,
        notes,
        routed_to: "implementation_owner",
      },
    });

    const progression = await finalizeCheckpointApproval(db as any, {
      projectId,
      milestoneId: sprintId,
      decidedAt: now,
      reviewKind: sprint.phase_key === "build" || latestSubmission.checkpoint_type === "delivery_review" ? "delivery_review" : "approval_gate",
    });

    return NextResponse.json({
      ok: true,
      action,
      submissionId: latestSubmission.id,
      state: "approved_for_implementation",
      progression: progression.progression,
    });
  } catch (e: unknown) {
    console.error("[API /projects/:id/revision-decisions] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

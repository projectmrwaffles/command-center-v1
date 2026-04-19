import type { SupabaseClient } from '@supabase/supabase-js';
import { buildReviewEventPayload, computeProofBundleCompletenessStatus, deriveMilestoneEvidenceRequirements, resolveMilestoneCheckpointType } from './milestone-review.ts';
import { deriveReviewArtifacts } from './review-requests.ts';

type DbClient = SupabaseClient<any, 'public', any>;

type TaskLike = {
  id: string;
  title: string;
  status: string;
  task_type?: string | null;
  updated_at?: string | null;
};

type CompletionEventLike = {
  payload?: Record<string, unknown> | null;
};

export async function ensureMilestoneReviewSubmission(db: DbClient, input: {
  projectId: string;
  sprintId: string;
  sprintName?: string | null;
  tasks: TaskLike[];
  completionEvents?: CompletionEventLike[];
}) {
  const [{ data: latestSubmission, error: latestSubmissionError }, { data: sprint, error: sprintError }, { data: project, error: projectError }] = await Promise.all([
    db.from('milestone_submissions').select('id, status, revision_number').eq('sprint_id', input.sprintId).order('revision_number', { ascending: false }).limit(1).maybeSingle(),
    db.from('sprints').select('id, name, phase_key, approval_gate_required, delivery_review_required, delivery_review_status, checkpoint_type, checkpoint_evidence_requirements').eq('id', input.sprintId).maybeSingle(),
    db.from('projects').select('id, type, intake, links').eq('id', input.projectId).maybeSingle(),
  ]);

  if (latestSubmissionError) throw latestSubmissionError;
  if (sprintError) throw sprintError;
  if (projectError) throw projectError;
  if (!sprint) return null;
  const isBuildSprint = sprint.phase_key === 'build';
  const requiresReview = Boolean(sprint.approval_gate_required || sprint.delivery_review_required || isBuildSprint);
  if (!requiresReview) return null;
  if (latestSubmission?.id) return latestSubmission;

  const nextRevision = (latestSubmission?.revision_number || 0) + 1;
  const completedTasks = input.tasks.filter((task) => task.status === 'done');
  const derivedArtifacts = deriveReviewArtifacts({
    reviewTasks: input.tasks,
    completionEvents: input.completionEvents || [],
    links: (project as any)?.links || (project as any)?.intake?.links || null,
  });
  const reviewableArtifacts = derivedArtifacts.filter((artifact) => artifact.kind === 'preview_url' || artifact.kind === 'git_commit' || artifact.kind === 'workspace_file');
  if (completedTasks.length === 0) return null;
  const summary = `${input.sprintName || 'Checkpoint'} is ready for review.`;
  const whatChanged = completedTasks.length
    ? `Completed: ${completedTasks.map((task) => task.title).join('; ')}`
    : `Work in ${input.sprintName || 'this checkpoint'} has reached review-ready state.`;
  const reviewGuidance = completedTasks.some((task) => /frontend|design|ui|landing|page|feature/i.test(task.title))
    ? 'Review the visual/design output, compare against the requested scope, and request changes if the delivered experience is not acceptable.'
    : 'Review the submitted output and request changes if the delivered work does not meet the expected outcome.';

  const checkpointType = resolveMilestoneCheckpointType({
    checkpointType: sprint.checkpoint_type,
    sprintName: sprint.name || input.sprintName || null,
    phaseKey: sprint.phase_key || null,
    taskTypes: input.tasks.map((task) => task.task_type),
  }) || sprint.checkpoint_type || 'delivery_review';

  const generatedEvidenceRequirements = deriveMilestoneEvidenceRequirements({
    checkpointType,
    explicitRequirements: sprint.checkpoint_evidence_requirements,
    sprintName: sprint.name || input.sprintName || null,
    phaseKey: sprint.phase_key || null,
    taskTypes: input.tasks.map((task) => task.task_type),
    projectType: project?.type || null,
    projectIntake: project?.intake || null,
  });

  const { data: submission, error: submissionError } = await db
    .from('milestone_submissions')
    .insert({
      project_id: input.projectId,
      sprint_id: input.sprintId,
      checkpoint_type: checkpointType,
      evidence_requirements: generatedEvidenceRequirements,
      revision_number: nextRevision,
      summary,
      what_changed: whatChanged,
      risks: null,
      status: 'submitted',
    })
    .select()
    .single();

  if (submissionError || !submission) throw submissionError || new Error('Failed to create submission');

  const proofItemsPayload = (reviewableArtifacts.length > 0
    ? reviewableArtifacts
    : completedTasks.map((task) => ({
        kind: 'workspace_file' as const,
        label: task.title,
        value: '',
        sourceTaskId: task.id,
        sourceTaskTitle: task.title,
      }))
  ).map((artifact, index) => {
    const artifactKind = artifact.kind;
    let kind: 'artifact' | 'staging_url' | 'commit' | 'note' = 'note';
    const url: string | null = artifactKind === 'preview_url' ? artifact.value : null;
    let storagePath: string | null = null;

    if (artifactKind === 'workspace_file') {
      kind = 'artifact';
      storagePath = artifact.value;
    } else if (artifactKind === 'preview_url') {
      kind = 'staging_url';
    } else if (artifactKind === 'git_commit') {
      kind = 'commit';
    }

    return {
      kind,
      label: artifact.label,
      url,
      storage_path: storagePath,
      notes: artifact.sourceTaskTitle ? `Source task: ${artifact.sourceTaskTitle}` : null,
      metadata: {
        artifactKind,
        artifactValue: artifact.value,
        sourceTaskId: artifact.sourceTaskId || null,
        sourceTaskTitle: artifact.sourceTaskTitle || null,
        reviewGuidance,
      },
      sort_order: index,
    };
  });

  const bundleCompletenessStatus = computeProofBundleCompletenessStatus({
    checkpointType,
    evidenceRequirements: generatedEvidenceRequirements,
    items: proofItemsPayload,
  });

  const { data: bundle, error: bundleError } = await db
    .from('proof_bundles')
    .insert({
      submission_id: submission.id,
      title: `${input.sprintName || 'Checkpoint'} review packet`,
      summary: `Auto-generated review packet from completed workflow outputs. ${reviewGuidance}`,
      completeness_status: bundleCompletenessStatus,
    })
    .select()
    .single();

  if (bundleError || !bundle) throw bundleError || new Error('Failed to create proof bundle');

  if (proofItemsPayload.length > 0) {
    const { error: itemsError } = await db.from('proof_items').insert(proofItemsPayload.map((item) => ({
      proof_bundle_id: bundle.id,
      kind: item.kind,
      label: item.label,
      url: item.url,
      storage_path: item.storage_path,
      notes: item.notes,
      metadata: item.metadata,
      sort_order: item.sort_order,
    })));
    if (itemsError) throw itemsError;
  }

  const sprintStatusUpdate = checkpointType === 'delivery_review' && isBuildSprint
    ? { delivery_review_required: true, delivery_review_status: 'pending', updated_at: new Date().toISOString() }
    : { approval_gate_status: 'pending', updated_at: new Date().toISOString() };
  await db.from('sprints').update(sprintStatusUpdate).eq('id', input.sprintId).eq('project_id', input.projectId);

  await db.from('agent_events').insert({
    agent_id: null,
    project_id: input.projectId,
    event_type: 'milestone_submission_created',
    payload: buildReviewEventPayload({
      submissionId: submission.id,
      sprintId: input.sprintId,
      revisionNumber: nextRevision,
      summary,
    }),
  });

  return submission;
}

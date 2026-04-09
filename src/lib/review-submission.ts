import type { SupabaseClient } from '@supabase/supabase-js';
import { buildReviewEventPayload } from './milestone-review.ts';

type DbClient = SupabaseClient<any, 'public', any>;

type TaskLike = {
  id: string;
  title: string;
  status: string;
  updated_at?: string | null;
};

export async function ensureMilestoneReviewSubmission(db: DbClient, input: {
  projectId: string;
  sprintId: string;
  sprintName?: string | null;
  tasks: TaskLike[];
}) {
  const [{ data: activeSubmission, error: activeSubmissionError }, { data: sprint, error: sprintError }] = await Promise.all([
    db.from('milestone_submissions').select('id, status').eq('sprint_id', input.sprintId).in('status', ['submitted', 'under_review']).maybeSingle(),
    db.from('sprints').select('id, approval_gate_required').eq('id', input.sprintId).maybeSingle(),
  ]);

  if (activeSubmissionError) throw activeSubmissionError;
  if (sprintError) throw sprintError;
  if (!sprint?.approval_gate_required) return null;
  if (activeSubmission?.id) return activeSubmission;

  const { data: lastSubmission } = await db
    .from('milestone_submissions')
    .select('revision_number')
    .eq('sprint_id', input.sprintId)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextRevision = (lastSubmission?.revision_number || 0) + 1;
  const completedTasks = input.tasks.filter((task) => task.status === 'done');
  const summary = `${input.sprintName || 'Checkpoint'} is ready for review.`;
  const whatChanged = completedTasks.length
    ? `Completed: ${completedTasks.map((task) => task.title).join('; ')}`
    : `Work in ${input.sprintName || 'this checkpoint'} has reached review-ready state.`;
  const reviewGuidance = completedTasks.some((task) => /frontend|design|ui|landing|page|feature/i.test(task.title))
    ? 'Review the visual/design output, compare against the requested scope, and request changes if the delivered experience is not acceptable.'
    : 'Review the submitted output and request changes if the delivered work does not meet the expected outcome.';

  const { data: submission, error: submissionError } = await db
    .from('milestone_submissions')
    .insert({
      sprint_id: input.sprintId,
      revision_number: nextRevision,
      summary,
      what_changed: whatChanged,
      risks: null,
      status: 'submitted',
    })
    .select()
    .single();

  if (submissionError || !submission) throw submissionError || new Error('Failed to create submission');

  const { data: bundle, error: bundleError } = await db
    .from('proof_bundles')
    .insert({
      submission_id: submission.id,
      title: `${input.sprintName || 'Checkpoint'} review packet`,
      summary: `Auto-generated review packet from completed workflow outputs. ${reviewGuidance}`,
      completeness_status: completedTasks.length > 0 ? 'ready' : 'incomplete',
    })
    .select()
    .single();

  if (bundleError || !bundle) throw bundleError || new Error('Failed to create proof bundle');

  const proofItemsPayload = completedTasks.map((task, index) => ({
    proof_bundle_id: bundle.id,
    kind: 'note',
    label: task.title,
    url: null,
    storage_path: null,
    notes: `${task.title}\n\nTask id: ${task.id}\nUpdated: ${task.updated_at || 'unknown'}\n\nReviewer guidance: ${reviewGuidance}`,
    metadata: { taskId: task.id, updatedAt: task.updated_at || null, reviewGuidance },
    sort_order: index,
  }));

  if (proofItemsPayload.length > 0) {
    const { error: itemsError } = await db.from('proof_items').insert(proofItemsPayload);
    if (itemsError) throw itemsError;
  }

  await db.from('sprints').update({ approval_gate_status: 'pending', updated_at: new Date().toISOString() }).eq('id', input.sprintId).eq('project_id', input.projectId);

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

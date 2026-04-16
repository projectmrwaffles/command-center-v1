import './register-ts-aliases.mjs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const [{ processAttachmentBackedProject }, { buildAttachmentProcessingJobSummary, ATTACHMENT_PROCESSING_AGENT_ID }, { buildAttachmentKickoffStageState }] = await Promise.all([
  import(path.join(repoRoot, 'src/lib/project-requirements-repair.ts')),
  import(path.join(repoRoot, 'src/lib/attachment-processing-jobs.ts')),
  import(path.join(repoRoot, 'src/lib/project-attachment-finalize.ts')),
]);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function claimJob(job) {
  const { error } = await db.from('jobs').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'queued');
  return !error;
}

async function updateJob(jobId, status) {
  const { error } = await db.from('jobs').update({ status, updated_at: new Date().toISOString() }).eq('id', jobId);
  if (error) throw new Error(error.message || `Failed to update job ${jobId}`);
}

async function persistProjectIntake(projectId, intake) {
  const { error } = await db.from('projects').update({ intake, updated_at: new Date().toISOString() }).eq('id', projectId);
  if (error) throw new Error(error.message || `Failed to persist attachment stage for ${projectId}`);
}

async function processJob(job) {
  const projectId = job.project_id;
  if (!projectId) {
    await updateJob(job.id, 'blocked');
    return { projectId: null, status: 'blocked', reason: 'missing project_id' };
  }

  const { data: project, error } = await db
    .from('projects')
    .select('id, name, type, team_id, intake, links, github_repo_binding')
    .eq('id', projectId)
    .maybeSingle();

  if (error || !project) {
    await updateJob(job.id, 'blocked');
    return { projectId, status: 'blocked', reason: error?.message || 'project missing' };
  }

  const nextIntake = buildAttachmentKickoffStageState(project.intake || {}, 'extracting_attachment_text', {
    fileCount: project.intake?.attachmentKickoffState?.fileCount,
    detail: 'Attachment worker picked up the job and is extracting requirements from storage.',
    worker: 'attachment-worker',
    workerPickedUpAt: new Date().toISOString(),
  });
  await persistProjectIntake(projectId, nextIntake);

  try {
    const processed = await processAttachmentBackedProject(db, {
      project: {
        ...project,
        intake: nextIntake,
      },
      forceProcessing: true,
      fileCount: Number(project.intake?.attachmentKickoffState?.fileCount || 0) || undefined,
    });

    await updateJob(job.id, processed.attachmentRequirementsReady ? 'completed' : 'blocked');
    return {
      projectId,
      status: processed.attachmentRequirementsReady ? 'completed' : 'blocked',
      finalized: processed.finalized,
      attachmentRequirementsReady: processed.attachmentRequirementsReady,
      recoverable: processed.recoverable,
      summary: buildAttachmentProcessingJobSummary(projectId),
    };
  } catch (workerError) {
    await updateJob(job.id, 'blocked');
    throw workerError;
  }
}

export async function runAttachmentWorkerOnce() {
  const { data: jobs, error } = await db
    .from('jobs')
    .select('id, project_id, title, status, summary, updated_at')
    .eq('owner_agent_id', ATTACHMENT_PROCESSING_AGENT_ID)
    .like('summary', 'attachment_processing:%')
    .eq('status', 'queued')
    .order('updated_at', { ascending: true })
    .limit(10);

  if (error) throw new Error(error.message || 'Failed to load queued attachment jobs');

  const results = [];
  for (const job of jobs || []) {
    const claimed = await claimJob(job);
    if (!claimed) continue;
    results.push(await processJob(job));
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAttachmentWorkerOnce()
    .then((results) => {
      console.log(JSON.stringify({ processed: results.length, results }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

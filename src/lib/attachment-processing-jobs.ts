import { buildAttachmentKickoffStageState } from "@/lib/project-attachment-finalize";

export const ATTACHMENT_PROCESSING_AGENT_ID = "11111111-1111-1111-1111-000000000008";
export const ATTACHMENT_PROCESSING_JOB_PREFIX = "attachment_processing:";
export const ATTACHMENT_PROCESSING_JOB_TITLE = "Process attachment intake";

export type AttachmentJobDb = {
  from: (table: string) => any;
};

export function buildAttachmentProcessingJobSummary(projectId: string) {
  return `${ATTACHMENT_PROCESSING_JOB_PREFIX}${projectId}`;
}

export async function persistAttachmentQueuedState(
  db: AttachmentJobDb,
  input: { projectId: string; intake?: Record<string, unknown> | null; fileCount?: number }
) {
  const nextIntake = buildAttachmentKickoffStageState(input.intake || {}, "upload_received", {
    fileCount: input.fileCount,
    detail: "Files are saved. Waiting for the durable attachment worker to pick up processing.",
    queuedAt: new Date().toISOString(),
  });

  const { error } = await db
    .from("projects")
    .update({
      intake: nextIntake,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.projectId);

  if (error) throw new Error(error.message || "Failed to persist queued attachment state");
  return nextIntake;
}

export async function enqueueAttachmentProcessingJob(
  db: AttachmentJobDb,
  input: { projectId: string; projectName?: string | null; fileCount?: number }
) {
  const summary = buildAttachmentProcessingJobSummary(input.projectId);
  const now = new Date().toISOString();
  const existing = await db
    .from("jobs")
    .select("id, status")
    .eq("summary", summary)
    .eq("owner_agent_id", ATTACHMENT_PROCESSING_AGENT_ID)
    .limit(1)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message || "Failed to inspect attachment job queue");

  if (existing.data?.id) {
    const { error } = await db
      .from("jobs")
      .update({
        title: input.projectName ? `${ATTACHMENT_PROCESSING_JOB_TITLE}: ${input.projectName}` : ATTACHMENT_PROCESSING_JOB_TITLE,
        status: "queued",
        project_id: input.projectId,
        updated_at: now,
      })
      .eq("id", existing.data.id);
    if (error) throw new Error(error.message || "Failed to requeue attachment job");
    return { jobId: existing.data.id, queued: true, reused: true } as const;
  }

  const created = await db
    .from("jobs")
    .insert({
      project_id: input.projectId,
      owner_agent_id: ATTACHMENT_PROCESSING_AGENT_ID,
      title: input.projectName ? `${ATTACHMENT_PROCESSING_JOB_TITLE}: ${input.projectName}` : ATTACHMENT_PROCESSING_JOB_TITLE,
      status: "queued",
      summary,
    })
    .select("id")
    .single();

  if (created.error || !created.data?.id) throw new Error(created.error?.message || "Failed to create attachment job");
  return { jobId: created.data.id, queued: true, reused: false } as const;
}

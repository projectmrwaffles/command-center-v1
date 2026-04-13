export function shouldFinalizeProjectAfterAttachmentUpload(input: {
  sprintCount: number;
  attachmentRequirementsReady: boolean;
}) {
  return input.sprintCount === 0 && input.attachmentRequirementsReady;
}

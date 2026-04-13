import assert from 'node:assert/strict';
import { shouldFinalizeProjectAfterAttachmentUpload } from '../src/lib/project-attachment-finalize.ts';

assert.equal(
  shouldFinalizeProjectAfterAttachmentUpload({ sprintCount: 0, attachmentRequirementsReady: false }),
  false,
  'project kickoff must stay blocked when attachment-derived requirements are still missing'
);

assert.equal(
  shouldFinalizeProjectAfterAttachmentUpload({ sprintCount: 0, attachmentRequirementsReady: true }),
  true,
  'fresh attachment-backed projects should finalize once attachment-derived requirements are ready'
);

assert.equal(
  shouldFinalizeProjectAfterAttachmentUpload({ sprintCount: 2, attachmentRequirementsReady: false }),
  false,
  'existing projects should not re-finalize from upload gating logic'
);

console.log('PASS attachment upload gating blocks kickoff until attachment-derived requirements exist');

import assert from 'node:assert/strict';
import {
  ATTACHMENT_INTAKE_SPRINT_NAME,
  buildAttachmentKickoffFinalizedIntake,
  buildAttachmentKickoffReadyIntake,
  buildAttachmentKickoffWaitingIntake,
  hasAttachmentDerivedRequirements,
  isAttachmentKickoffShellSprint,
  shouldFinalizeAttachmentProjectNow,
  shouldFinalizeProjectAfterAttachmentUpload,
  shouldSeedAttachmentKickoffShell,
} from '../src/lib/project-attachment-finalize.ts';

const intakeWithoutAttachmentRequirements = {
  summary: 'Need a new dashboard',
  requirements: {
    derivedAt: new Date().toISOString(),
    summary: ['Base intake summary'],
    constraints: [],
    requiredFrameworks: [],
    sourceCount: 1,
    sources: [{ title: 'Intake', type: 'intake', evidence: ['dashboard'] }],
    technologyRequirements: [],
  },
};

const intakeWithAttachmentRequirements = {
  ...intakeWithoutAttachmentRequirements,
  requirements: {
    ...intakeWithoutAttachmentRequirements.requirements,
    sourceCount: 2,
    sources: [
      ...intakeWithoutAttachmentRequirements.requirements.sources,
      { title: 'Spec.pdf', type: 'prd_pdf', evidence: ['Use Next.js', 'Use Supabase'] },
    ],
  },
};

assert.equal(hasAttachmentDerivedRequirements(intakeWithoutAttachmentRequirements.requirements), false);
assert.equal(hasAttachmentDerivedRequirements(intakeWithAttachmentRequirements.requirements), true);

assert.equal(shouldSeedAttachmentKickoffShell({ hasAttachments: true, intake: intakeWithoutAttachmentRequirements }), true);
assert.equal(shouldFinalizeAttachmentProjectNow({ hasAttachments: true, intake: intakeWithoutAttachmentRequirements }), false);

const waitingIntake = buildAttachmentKickoffWaitingIntake(intakeWithoutAttachmentRequirements);
assert.equal(waitingIntake.attachmentKickoffState.status, 'waiting_for_attachment_requirements');

assert.equal(isAttachmentKickoffShellSprint({ name: ATTACHMENT_INTAKE_SPRINT_NAME }), true);
assert.equal(
  shouldFinalizeProjectAfterAttachmentUpload({
    sprintCount: 1,
    attachmentRequirementsReady: true,
    hasAttachmentKickoffShell: true,
  }),
  true,
);
assert.equal(
  shouldFinalizeProjectAfterAttachmentUpload({
    sprintCount: 1,
    attachmentRequirementsReady: false,
    hasAttachmentKickoffShell: true,
  }),
  false,
);

const readyIntake = buildAttachmentKickoffReadyIntake(intakeWithAttachmentRequirements);
assert.equal(readyIntake.attachmentKickoffState.status, 'requirements_ready');

const finalizedIntake = buildAttachmentKickoffFinalizedIntake(readyIntake);
assert.equal(finalizedIntake.attachmentKickoffState.status, 'finalized');
assert.ok(finalizedIntake.attachmentKickoffState.finalizedAt);

assert.equal(shouldFinalizeAttachmentProjectNow({ hasAttachments: true, intake: intakeWithAttachmentRequirements }), true);

console.log('PASS attachment-backed project creation seeds a waiting shell and only finalizes after attachment requirements exist');

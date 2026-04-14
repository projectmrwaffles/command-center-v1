import assert from "node:assert/strict";

import { computeProofBundleCompletenessStatus, deriveMilestoneEvidenceRequirements, getCheckpointEvidenceRequirements, validateProofBundleRequirements } from "../src/lib/milestone-review.ts";
import { buildProjectKickoffPlan } from "../src/lib/project-kickoff.ts";
import { deriveReviewCheckpointState } from "../src/lib/review-checkpoint-state.ts";

{
  const legacyWeakCase = validateProofBundleRequirements({
    checkpointType: "acceptance_review",
    items: [{ kind: "github_pr" }],
  });

  assert.equal(legacyWeakCase.ok, false, "acceptance review should not be review-ready from code-only proof");
  assert.deepEqual(getCheckpointEvidenceRequirements("acceptance_review").requiredEvidenceKinds, ["screenshot", "staging_url", "loom"]);
  assert.match(legacyWeakCase.message || "", /acceptance review requires at least one screenshot or staging url or loom evidence item/i);

  const checkpointState = deriveReviewCheckpointState({
    approvalGateStatus: "pending",
    reviewSummary: {
      latestSubmissionId: "sub-acceptance",
      checkpointType: "acceptance_review",
      proofCompletenessStatus: computeProofBundleCompletenessStatus({
        checkpointType: "acceptance_review",
        items: [{ kind: "github_pr" }],
      }),
      proofItemCount: 1,
    },
  });

  assert.equal(checkpointState.key, "awaiting_evidence", "acceptance review should stay in awaiting evidence until validation artifacts exist");
  console.log("PASS acceptance review stays awaiting evidence with PR-only proof");
}

{
  const readyAcceptance = validateProofBundleRequirements({
    checkpointType: "acceptance_review",
    items: [{ kind: "github_pr" }, { kind: "screenshot" }],
  });

  assert.equal(readyAcceptance.ok, true, "acceptance review should become ready once validation evidence exists");
  assert.equal(computeProofBundleCompletenessStatus({
    checkpointType: "acceptance_review",
    items: [{ kind: "github_pr" }, { kind: "screenshot" }],
  }), "ready");
  console.log("PASS acceptance review becomes ready with screenshot-backed validation evidence");
}

{
  const blockedLaunch = validateProofBundleRequirements({
    checkpointType: "launch_approval",
    items: [{ kind: "screenshot" }, { kind: "doc" }],
  });
  assert.equal(blockedLaunch.ok, false, "launch approval should require a live staging url, not just generic proof");

  const readyLaunch = validateProofBundleRequirements({
    checkpointType: "launch_approval",
    items: [{ kind: "staging_url" }, { kind: "screenshot" }],
  });
  assert.equal(readyLaunch.ok, true, "launch approval should become ready once a staging url is present");
  console.log("PASS launch approval now depends on live preview evidence");
}

{
  const kickoffPlan = buildProjectKickoffPlan({
    projectName: "Metadata Pilot",
    type: "web_app",
    intake: {
      capabilities: ["frontend"],
      requirements: {
        summary: ["Ship a reviewable MVP"],
        technologyRequirements: ["Next.js"],
        sources: [{ type: "prd", evidence: ["spec"] }],
      },
    },
  });
  const validatePhase = kickoffPlan.find((phase) => phase.key === "validate");
  assert.ok(validatePhase, "kickoff should seed a validate phase");
  assert.equal(validatePhase.checkpointType, "acceptance_review", "validate phase should seed explicit checkpoint type");
  assert.deepEqual(validatePhase.checkpointEvidenceRequirements?.requiredEvidenceKinds, ["screenshot", "staging_url", "loom"]);

  const seededPolicy = deriveMilestoneEvidenceRequirements({
    checkpointType: validatePhase.checkpointType,
    explicitRequirements: validatePhase.checkpointEvidenceRequirements,
    sprintName: validatePhase.name,
    phaseKey: validatePhase.key,
    taskTypes: ["qa_validation"],
  });
  assert.deepEqual(seededPolicy, validatePhase.checkpointEvidenceRequirements, "explicit seeded evidence policy should win over validation heuristics");

  const metadataReady = validateProofBundleRequirements({
    checkpointType: validatePhase.checkpointType,
    evidenceRequirements: seededPolicy,
    items: [{ kind: "github_pr" }, { kind: "loom" }],
  });
  assert.equal(metadataReady.ok, true, "seeded validate milestone should become ready with metadata-approved evidence");
  console.log("PASS seeded validate phase uses explicit metadata-driven evidence policy");
}

console.log("verify-phase-aware-checkpoint-readiness: ok");

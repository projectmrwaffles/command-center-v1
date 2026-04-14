import assert from "node:assert/strict";

import { computeProofBundleCompletenessStatus, getCheckpointEvidenceRequirements, validateProofBundleRequirements } from "../src/lib/milestone-review.ts";
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

console.log("verify-phase-aware-checkpoint-readiness: ok");

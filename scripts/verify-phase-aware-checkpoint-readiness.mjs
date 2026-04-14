import assert from "node:assert/strict";

import { computeProofBundleCompletenessStatus, deriveMilestoneEvidenceRequirements, getCheckpointEvidenceRequirements, resolveMilestoneCheckpointType, validateProofBundleRequirements } from "../src/lib/milestone-review.ts";
import { buildProjectKickoffPlan } from "../src/lib/project-kickoff.ts";
import { deriveReviewCheckpointState } from "../src/lib/review-checkpoint-state.ts";

{
  const weakScopeCase = validateProofBundleRequirements({
    checkpointType: "scope_approval",
    items: [{ kind: "github_pr" }],
  });

  assert.equal(weakScopeCase.ok, false, "scope approval should reject engineering-only proof without an actual scope artifact");
  assert.deepEqual(getCheckpointEvidenceRequirements("scope_approval").requiredEvidenceKinds, ["doc", "checklist", "loom"]);
  assert.match(weakScopeCase.message || "", /scope approval requires at least one doc or checklist or loom evidence item/i);

  const awaitingScopeEvidence = deriveReviewCheckpointState({
    approvalGateStatus: "pending",
    reviewSummary: {
      latestSubmissionId: "sub-scope",
      checkpointType: "scope_approval",
      proofCompletenessStatus: computeProofBundleCompletenessStatus({
        checkpointType: "scope_approval",
        items: [{ kind: "github_pr" }],
      }),
      proofItemCount: 1,
    },
  });
  assert.equal(awaitingScopeEvidence.key, "awaiting_evidence", "scope approval should stay awaiting evidence until a scope artifact exists");

  const readyScopeState = deriveReviewCheckpointState({
    approvalGateStatus: "pending",
    reviewSummary: {
      latestSubmissionId: "sub-scope-ready",
      checkpointType: "scope_approval",
      proofCompletenessStatus: computeProofBundleCompletenessStatus({
        checkpointType: "scope_approval",
        items: [{ kind: "doc" }],
      }),
      proofItemCount: 1,
    },
  });
  assert.equal(readyScopeState.key, "ready_for_review", "scope approval should become ready for review once metadata-approved evidence exists");

  const legacyDiscoveryCheckpointType = resolveMilestoneCheckpointType({
    checkpointType: null,
    sprintName: "Phase 1 · Discover",
    phaseKey: "discover",
    taskTypes: ["discovery_plan"],
  });
  assert.equal(legacyDiscoveryCheckpointType, "scope_approval", "legacy discovery milestones should infer a scope approval checkpoint type instead of generic delivery review");

  const inferredDiscoveryPolicy = deriveMilestoneEvidenceRequirements({
    checkpointType: legacyDiscoveryCheckpointType,
    sprintName: "Phase 1 · Discover",
    phaseKey: "discover",
    taskTypes: ["discovery_plan"],
  });
  assert.deepEqual(inferredDiscoveryPolicy.requiredEvidenceKinds, ["doc", "checklist", "loom"]);
  assert.equal(inferredDiscoveryPolicy.requiredEvidenceKindsMode, "any");
  assert.equal(validateProofBundleRequirements({
    checkpointType: legacyDiscoveryCheckpointType,
    evidenceRequirements: inferredDiscoveryPolicy,
    items: [{ kind: "github_pr" }],
  }).ok, false, "legacy discovery milestones should stay awaiting evidence with engineering-only proof");
  assert.equal(validateProofBundleRequirements({
    checkpointType: legacyDiscoveryCheckpointType,
    evidenceRequirements: inferredDiscoveryPolicy,
    items: [{ kind: "doc" }],
  }).ok, true, "legacy discovery milestones should become ready once a planning artifact is attached");
  console.log("PASS legacy discovery milestones now infer metadata-driven scope approval evidence policy");
}

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
  const legacyMessageCheckpointType = resolveMilestoneCheckpointType({
    checkpointType: null,
    sprintName: "Phase 2 · Message",
    phaseKey: "message",
    taskTypes: ["content_messaging"],
  });
  assert.equal(legacyMessageCheckpointType, "content_review", "legacy message milestones should infer a content review checkpoint type instead of generic delivery review");

  const legacyMessagePolicy = deriveMilestoneEvidenceRequirements({
    checkpointType: legacyMessageCheckpointType,
    sprintName: "Phase 2 · Message",
    phaseKey: "message",
    taskTypes: ["content_messaging"],
  });
  assert.deepEqual(legacyMessagePolicy.requiredEvidenceKinds, ["doc", "artifact", "screenshot", "staging_url", "loom"]);
  assert.equal(validateProofBundleRequirements({
    checkpointType: legacyMessageCheckpointType,
    evidenceRequirements: legacyMessagePolicy,
    items: [{ kind: "github_pr" }],
  }).ok, false, "legacy message milestones should stay awaiting evidence with engineering-only proof");
  assert.equal(validateProofBundleRequirements({
    checkpointType: legacyMessageCheckpointType,
    evidenceRequirements: legacyMessagePolicy,
    items: [{ kind: "doc" }],
  }).ok, true, "legacy message milestones should become ready once a real messaging artifact is attached");
  console.log("PASS legacy message milestones now infer metadata-driven content-review evidence policy");
}

{
  const discoveryKickoffPlan = buildProjectKickoffPlan({
    projectName: "Metadata Pilot",
    type: "web_app",
    intake: {
      shape: "hybrid-not-sure",
      goals: ["Help define scope and recommend the right execution path"],
      capabilities: ["frontend", "ux-ui", "content-copy"],
      requirements: {
        summary: [],
        technologyRequirements: ["Next.js"],
        sources: [{ type: "prd", evidence: ["spec"] }],
      },
    },
  });
  const discoverPhase = discoveryKickoffPlan.find((phase) => phase.key === "discover");
  assert.ok(discoverPhase, "kickoff should seed a discover phase when discovery is needed");
  assert.equal(discoverPhase.checkpointType, "scope_approval", "discover phase should seed explicit checkpoint type");
  assert.deepEqual(discoverPhase.checkpointEvidenceRequirements?.requiredEvidenceKinds, ["doc", "checklist", "loom"]);
  assert.equal(validateProofBundleRequirements({
    checkpointType: discoverPhase.checkpointType,
    evidenceRequirements: discoverPhase.checkpointEvidenceRequirements,
    items: [{ kind: "github_pr" }],
  }).ok, false, "discover scope approval should reject unrelated engineering proof");
  assert.equal(validateProofBundleRequirements({
    checkpointType: discoverPhase.checkpointType,
    evidenceRequirements: discoverPhase.checkpointEvidenceRequirements,
    items: [{ kind: "doc" }],
  }).ok, true, "discover scope approval should accept a planning artifact");

  const kickoffPlan = buildProjectKickoffPlan({
    projectName: "Metadata Pilot",
    type: "web_app",
    intake: {
      capabilities: ["frontend", "ux-ui", "content-copy"],
      requirements: {
        summary: ["Ship a reviewable MVP"],
        technologyRequirements: ["Next.js"],
        sources: [{ type: "prd", evidence: ["spec"] }],
      },
    },
  });

  const designPhase = kickoffPlan.find((phase) => phase.key === "design");
  assert.ok(designPhase, "kickoff should seed a design phase");
  assert.equal(designPhase.checkpointType, "design_review", "design phase should seed explicit checkpoint type");
  assert.equal(designPhase.checkpointEvidenceRequirements?.screenshotRequired, true);
  assert.equal(designPhase.checkpointEvidenceRequirements?.minScreenshotCount, 1);

  const seededDesignPolicy = deriveMilestoneEvidenceRequirements({
    checkpointType: designPhase.checkpointType,
    explicitRequirements: designPhase.checkpointEvidenceRequirements,
    sprintName: "Validate visual QA before launch",
    phaseKey: "validate",
    taskTypes: ["qa_validation"],
  });
  assert.deepEqual(seededDesignPolicy, designPhase.checkpointEvidenceRequirements, "explicit design metadata should win over validation heuristics");
  assert.equal(validateProofBundleRequirements({
    checkpointType: designPhase.checkpointType,
    evidenceRequirements: seededDesignPolicy,
    items: [{ kind: "loom" }],
  }).ok, false, "design review should still require a screenshot when metadata says so");
  assert.equal(validateProofBundleRequirements({
    checkpointType: designPhase.checkpointType,
    evidenceRequirements: seededDesignPolicy,
    items: [{ kind: "screenshot" }],
  }).ok, true, "design review should become ready once the seeded screenshot evidence exists");

  const buildPhase = kickoffPlan.find((phase) => phase.key === "build");
  assert.ok(buildPhase, "kickoff should seed a build phase");
  assert.equal(buildPhase.checkpointType, "delivery_review", "build phase should seed explicit checkpoint type");
  assert.deepEqual(buildPhase.checkpointEvidenceRequirements?.requiredEvidenceKinds, ["screenshot", "staging_url", "github_pr", "commit", "loom"]);

  const seededBuildPolicy = deriveMilestoneEvidenceRequirements({
    checkpointType: buildPhase.checkpointType,
    explicitRequirements: buildPhase.checkpointEvidenceRequirements,
    sprintName: buildPhase.name,
    phaseKey: buildPhase.key,
    taskTypes: ["build_implementation"],
  });
  assert.deepEqual(seededBuildPolicy, buildPhase.checkpointEvidenceRequirements, "explicit build metadata should be preserved as-is");
  assert.equal(validateProofBundleRequirements({
    checkpointType: buildPhase.checkpointType,
    evidenceRequirements: seededBuildPolicy,
    items: [{ kind: "doc" }],
  }).ok, false, "build review should reject non-deliverable proof even with seeded metadata");
  assert.equal(validateProofBundleRequirements({
    checkpointType: buildPhase.checkpointType,
    evidenceRequirements: seededBuildPolicy,
    items: [{ kind: "github_pr" }],
  }).ok, true, "build review should accept seeded metadata-approved delivery evidence");

  const messagePhase = kickoffPlan.find((phase) => phase.key === "message");
  assert.ok(messagePhase, "kickoff should seed a message phase");
  assert.equal(messagePhase.checkpointType, "content_review", "message phase should seed a content-oriented checkpoint type");
  assert.deepEqual(messagePhase.checkpointEvidenceRequirements?.requiredEvidenceKinds, ["doc", "artifact", "screenshot", "staging_url", "loom"]);
  assert.equal(messagePhase.checkpointEvidenceRequirements?.requiredEvidenceKindsMode, "any");

  const seededContentPolicy = deriveMilestoneEvidenceRequirements({
    checkpointType: messagePhase.checkpointType,
    explicitRequirements: messagePhase.checkpointEvidenceRequirements,
    sprintName: messagePhase.name,
    phaseKey: messagePhase.key,
    taskTypes: ["content_messaging"],
  });
  assert.deepEqual(seededContentPolicy, messagePhase.checkpointEvidenceRequirements, "explicit content metadata should win over defaults");
  assert.equal(validateProofBundleRequirements({
    checkpointType: messagePhase.checkpointType,
    evidenceRequirements: seededContentPolicy,
    items: [{ kind: "github_pr" }],
  }).ok, false, "content review should reject unrelated engineering-only proof");
  assert.equal(validateProofBundleRequirements({
    checkpointType: messagePhase.checkpointType,
    evidenceRequirements: seededContentPolicy,
    items: [{ kind: "doc" }],
  }).ok, true, "content review should become ready once an actual messaging artifact is attached");

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
  console.log("PASS seeded kickoff phases use explicit metadata-driven evidence policy across discover, design, build, content, launch, and validate checkpoints");
}

console.log("verify-phase-aware-checkpoint-readiness: ok");

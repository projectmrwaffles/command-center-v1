import { getSprintReviewEligibility, resolveSprintReviewSurface } from "../src/lib/review-request-guards.ts";

const cases = [
  {
    name: "build delivery review uses delivery_review state instead of approval gate",
    surface: resolveSprintReviewSurface({
      approvalGateRequired: false,
      approvalGateStatus: "not_requested",
      deliveryReviewRequired: true,
      deliveryReviewStatus: "not_requested",
      checkpointType: "delivery_review",
      phaseKey: "build",
    }),
    eligibility: getSprintReviewEligibility({
      approvalGateRequired: false,
      approvalGateStatus: "not_requested",
      deliveryReviewRequired: true,
      deliveryReviewStatus: "not_requested",
      checkpointType: "delivery_review",
      phaseKey: "build",
      taskStatuses: ["done", "done"],
    }),
    expect: (surface, eligibility) => surface.reviewKind === "delivery_review" && eligibility.ok,
    detail: (surface, eligibility) => `reviewKind=${surface.reviewKind}, required=${surface.required}, status=${surface.status}, eligible=${eligibility.ok}`,
  },
  {
    name: "pending build delivery review blocks duplicate request via delivery_review_status",
    surface: resolveSprintReviewSurface({
      approvalGateRequired: false,
      approvalGateStatus: "not_requested",
      deliveryReviewRequired: true,
      deliveryReviewStatus: "pending",
      checkpointType: "delivery_review",
      phaseKey: "build",
    }),
    eligibility: getSprintReviewEligibility({
      approvalGateRequired: false,
      approvalGateStatus: "not_requested",
      deliveryReviewRequired: true,
      deliveryReviewStatus: "pending",
      checkpointType: "delivery_review",
      phaseKey: "build",
      taskStatuses: ["done"],
    }),
    expect: (surface, eligibility) => surface.reviewKind === "delivery_review" && !eligibility.ok && eligibility.reason.includes("already pending"),
    detail: (surface, eligibility) => `reviewKind=${surface.reviewKind}, status=${surface.status}, reason=${eligibility.ok ? 'ok' : eligibility.reason}`,
  },
  {
    name: "pre-build checkpoint stays on approval_gate state",
    surface: resolveSprintReviewSurface({
      approvalGateRequired: true,
      approvalGateStatus: "pending",
      deliveryReviewRequired: true,
      deliveryReviewStatus: "not_requested",
      checkpointType: "prebuild_checkpoint",
      phaseKey: "build",
    }),
    eligibility: getSprintReviewEligibility({
      approvalGateRequired: true,
      approvalGateStatus: "pending",
      deliveryReviewRequired: true,
      deliveryReviewStatus: "not_requested",
      checkpointType: "prebuild_checkpoint",
      phaseKey: "build",
      taskStatuses: ["done"],
    }),
    expect: (surface, eligibility) => surface.reviewKind === "approval_gate" && !eligibility.ok && eligibility.reason.includes("already pending"),
    detail: (surface, eligibility) => `reviewKind=${surface.reviewKind}, status=${surface.status}, reason=${eligibility.ok ? 'ok' : eligibility.reason}`,
  },
];

let failed = false;
for (const testCase of cases) {
  const ok = testCase.expect(testCase.surface, testCase.eligibility);
  console.log(`${ok ? "PASS" : "FAIL"} - ${testCase.name}: ${testCase.detail(testCase.surface, testCase.eligibility)}`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);

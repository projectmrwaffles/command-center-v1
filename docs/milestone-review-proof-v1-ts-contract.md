# Milestone Review + Proof V1 — TypeScript Contract

Owner: Bolt
QC Approver: Shield

This file defines the intended app-layer contract for implementation.

---

## Canonical domain types

```ts
export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'approved'
  | 'superseded';

export type SubmissionDecision = 'approve' | 'request_changes';

export type ProofCompletenessStatus =
  | 'incomplete'
  | 'ready'
  | 'needs_update'
  | 'archived';

export type ProofItemKind =
  | 'figma'
  | 'screenshot'
  | 'staging_url'
  | 'github_pr'
  | 'commit'
  | 'loom'
  | 'doc'
  | 'artifact'
  | 'checklist'
  | 'note';

export type FeedbackType = 'blocker' | 'required' | 'optional' | 'question';
export type FeedbackStatus = 'open' | 'resolved' | 'carried_forward';
```

---

## Core records

```ts
export type MilestoneSubmission = {
  id: string;
  sprintId: string;
  submittedByAgentId: string | null;
  decidedByAgentId: string | null;
  approvalId: string | null;
  revisionNumber: number;
  summary: string;
  whatChanged: string;
  risks: string | null;
  status: SubmissionStatus;
  decision: SubmissionDecision | null;
  decisionNotes: string | null;
  submittedAt: string;
  decidedAt: string | null;
  supersededBySubmissionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProofBundle = {
  id: string;
  submissionId: string;
  createdByAgentId: string | null;
  title: string;
  summary: string | null;
  completenessStatus: ProofCompletenessStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProofItem = {
  id: string;
  proofBundleId: string;
  createdByAgentId: string | null;
  kind: ProofItemKind;
  label: string;
  url: string | null;
  storagePath: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  sortOrder: number;
  createdAt: string;
};

export type SubmissionFeedbackItem = {
  id: string;
  submissionId: string;
  authorAgentId: string | null;
  feedbackType: FeedbackType;
  body: string;
  status: FeedbackStatus;
  createdAt: string;
  resolvedAt: string | null;
};
```

---

## Request payloads

```ts
export type SubmitMilestoneForReviewInput = {
  summary: string;
  whatChanged: string;
  risks?: string | null;
  proofBundle: {
    title: string;
    summary?: string | null;
    items: Array<{
      kind: ProofItemKind;
      label: string;
      url?: string | null;
      storagePath?: string | null;
      notes?: string | null;
      metadata?: Record<string, unknown>;
      sortOrder?: number;
    }>;
  };
};

export type RequestChangesInput = {
  submissionId: string;
  decisionNotes?: string | null;
  feedbackItems: Array<{
    feedbackType: FeedbackType;
    body: string;
  }>;
};

export type ApproveSubmissionInput = {
  submissionId: string;
  note?: string | null;
};

export type ResubmitMilestoneInput = {
  priorSubmissionId: string;
  summary: string;
  whatChanged: string;
  risks?: string | null;
  proofBundle: SubmitMilestoneForReviewInput['proofBundle'];
};
```

---

## View-models

```ts
export type MilestoneReviewHistoryItem = {
  submission: MilestoneSubmission;
  proofBundle: ProofBundle | null;
  proofItems: ProofItem[];
  feedbackItems: SubmissionFeedbackItem[];
};

export type MilestoneReviewDetail = {
  sprint: {
    id: string;
    projectId: string;
    name: string;
    status: string | null;
    approvalGateRequired: boolean | null;
    approvalGateStatus: string | null;
  };
  latestSubmission: MilestoneSubmission | null;
  submissions: MilestoneSubmission[];
  latestProofBundle: ProofBundle | null;
  latestProofItems: ProofItem[];
  latestFeedbackItems: SubmissionFeedbackItem[];
  history: MilestoneReviewHistoryItem[];
  timeline: Array<{
    id: string;
    eventType: string;
    createdAt: string;
    payload: Record<string, unknown> | null;
  }>;
};

export type ReviewQueueItem = {
  projectId: string;
  projectName: string;
  sprintId: string;
  sprintName: string;
  submissionId: string;
  revisionNumber: number;
  ownerName: string | null;
  submittedAt: string;
  proofCompletenessStatus: ProofCompletenessStatus | null;
  proofItemCount: number;
  status: SubmissionStatus;
};
```

---

## Required invariants

Bolt must enforce these in app logic:

1. One active submission per sprint
   - active = `submitted` or `under_review`
2. Request changes requires at least one `required` or `blocker` feedback item
3. Approve requires linked proof bundle with `completenessStatus = 'ready'`
4. Resubmission creates a new submission row with incremented revision number
5. Prior submission is never updated in-place into the new round
6. `sprints.approval_gate_status` must stay aligned with latest submission state

---

## Suggested file placement

- `src/lib/milestone-review.ts` for domain helpers + type exports
- `src/app/api/projects/[id]/milestones/[milestoneId]/submit/route.ts`
- `src/app/api/projects/[id]/milestones/[milestoneId]/request-changes/route.ts`
- `src/app/api/projects/[id]/milestones/[milestoneId]/approve/route.ts`
- `src/app/api/projects/[id]/milestones/[milestoneId]/resubmit/route.ts`

If Bolt prefers server actions instead of route handlers, preserve the same input/output contract.

---

## QC acceptance

Shield should verify:
- type names match runtime states used in routes/UI
- route payloads reject invalid enum values
- view-models are sufficient to render:
  - milestone detail page
  - review queue
  - proofs browser
- no hidden state mutations bypass the invariants above

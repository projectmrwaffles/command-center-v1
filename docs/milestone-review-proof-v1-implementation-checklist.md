# Milestone Review + Proof V1 — Implementation Checklist

Owner: Bolt
QC Approver: Shield

Use this as the execution contract.

---

## Phase 1 — DB + types

### Owner tasks
- Add migration for:
  - `milestone_submissions`
  - `proof_bundles`
  - `proof_items`
  - `submission_feedback_items`
- Add TypeScript types for:
  - submission status
  - decision status
  - proof completeness
  - proof item kinds
  - feedback item types/statuses
- Add shared query/view-model helpers for milestone review detail loading

### QC gates
- Schema compiles cleanly
- Types match DB enum/check sets
- No naming collisions with current repo data model

---

## Phase 2 — server actions / API

### Owner tasks
- Implement submit milestone for review
- Implement request changes
- Implement approve submission
- Implement resubmit revision
- Ensure these mutate:
  - new review tables
  - linked approval row where compatibility is needed
  - `sprints.approval_gate_status`
  - event history

### QC gates
- Cannot submit if active submission already exists
- Cannot request changes without blocker/required feedback
- Cannot approve if proof bundle is not `ready`
- Cannot resubmit unless prior submission is `changes_requested`
- Revision number increments correctly
- Prior submission becomes historical, not overwritten

---

## Phase 3 — UI surfaces

### Owner tasks
- Enhance `/projects/[id]` milestone area
- Add `/projects/[id]/milestones/[milestoneId]`
- Add `/reviews`
- Keep `/approvals` intact for compatibility

### QC gates
- Milestone page shows:
  - sprint/milestone info
  - current submission
  - proof bundle
  - feedback
  - revision history
  - timeline
- `/reviews` shows only actual awaiting-review items
- Owner/reviewer actions appear only in the right states

---

## Phase 4 — `/proofs` evolution

### Owner tasks
- Refactor `/proofs` to read proof bundle-backed data
- Transitional mixed-source mode is acceptable temporarily if clearly labeled
- Show linkages:
  - project
  - sprint/milestone
  - revision number
  - decision state

### QC gates
- `/proofs` acts as evidence browser, not another decision inbox
- Proof items are traceable to submission and milestone
- Legacy approvals-backed records do not silently conflict with new proof-bundle-backed records

---

## Required end-to-end verification

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

Then manually verify this full path:

1. Open a project with milestones
2. Open a milestone
3. Submit review with proof bundle
4. Confirm it appears in `/reviews`
5. Request changes with required feedback
6. Confirm milestone returns to revision state
7. Resubmit as round 2
8. Approve
9. Confirm sprint approval gate becomes approved
10. Confirm `/proofs` shows evidence linked to the correct round
11. Confirm project timeline reconstructs the full chain

If any step fails, the slice is not done.

---

## Final QC verdict rules

Shield should FAIL the slice if any of these happen:
- more than one active submission per sprint
- approvals and submission states drift out of sync
- request-changes can be submitted without structured feedback
- approve works on incomplete proof bundle
- resubmission mutates prior history instead of creating a new revision row
- `/proofs` duplicates review-queue behavior instead of evidence-browser behavior

Shield should PASS only when commands + UI behavior + history chain all check out.

# Command Center V1 — Delivery Feedback & Revisions Loop Spec

## Goal
Add a first-class in-product workflow for post-delivery feedback so users can review delivered work, approve it, request specific revisions, or reopen completed work without falling back to Telegram.

This should be a structured review loop, not a generic chat surface.

---

## Problem
Today, once a task or deliverable is marked done, there is no native Command Center path for the operator to say:
- this is approved,
- this needs changes,
- here are the requested revisions,
- this was approved but must be reopened,
- this feedback has been addressed and is ready for re-review.

That creates four failures:
1. **Feedback escapes the system** into Telegram or memory.
2. **Completed work is falsely final** even when revisions are still active.
3. **There is no durable audit trail** for why a deliverable was reopened or changed.
4. **The operator lacks a clean control loop** between delivery, review, revision, and acceptance.

For a human-in-the-loop delivery cockpit, this is a core gap.

---

## V1 product goals
1. Let an operator review a completed deliverable in-product.
2. Let the operator choose one of three structured actions:
   - approve,
   - request revisions,
   - reopen.
3. Preserve feedback as durable, attributable records tied to the project and task.
4. Route revision requests back into the delivery workflow with clear status changes.
5. Show current review state in project context and recent signals.
6. Keep the flow lightweight enough for internal V1.

## Non-goals
- Generic back-and-forth chat threads.
- Multi-reviewer workflows or formal stakeholder voting.
- Version diffing across artifacts.
- Customer-facing commenting or external client portals.
- Automatic agent execution from freeform feedback.
- Rich annotation on images/files in V1.

---

## Core V1 concept
Introduce a first-class **Feedback Request** object for delivered work.

A feedback request is created when a task enters a reviewable completed state or when an operator explicitly opens review on a delivered item. It captures:
- what was delivered,
- who is reviewing,
- current review status,
- latest decision,
- structured revision notes,
- whether the underlying task was reopened.

This is distinct from:
- **Approvals** = trust/risk decision gates during delivery.
- **Feedback requests** = post-delivery acceptance and revision loop for the output itself.

Rule of thumb:
- use **approvals** when work needs permission to proceed,
- use **feedback/revisions** when delivered work needs acceptance or changes.

---

## Primary user stories
1. **As an operator**, when a task is marked complete, I want to review the output in Command Center and either approve it or request changes.
2. **As an operator**, when I request revisions, I want to provide structured notes so the team knows exactly what to change.
3. **As an operator**, when I change my mind after approval, I want to reopen the work without losing the previous decision history.
4. **As an operator**, I want to see whether a task is awaiting review, in revision, ready for re-review, or fully approved.
5. **As an operator**, I want the project timeline to show delivery, revision requests, resubmission, approval, and reopen events in order.
6. **As a delivery owner**, I want revision requests routed back as actionable work rather than buried in chat.

---

## Recommended V1 scope
### In scope
- One reviewer role: the operator.
- Review action entry point from project task detail and delivered/completed state.
- Structured feedback form.
- Revision loop statuses.
- Reopen after approval.
- Timeline/events for all review actions.
- Dashboard/project signals for items awaiting review or revision.
- Simple queue/filter for “Needs review” and “In revision”.

### Out of scope
- Multiple assignees or approval chains.
- Inline artifact annotation.
- Artifact version comparison UI.
- Public share links.
- SLA automation/escalations.
- Granular permissions beyond current internal model.

---

## Object model
### 1) `feedback_requests`
Recommended canonical fields:
- `id`
- `project_id`
- `task_id` (or current sprint/work item id)
- `job_id` nullable
- `agent_id` nullable
- `status`
- `decision_status`
- `summary`
- `delivery_summary` nullable
- `requested_by`
- `requested_at`
- `decided_by` nullable
- `decided_at` nullable
- `reopened_from_feedback_id` nullable
- `latest_submission_at` nullable
- `resolved_at` nullable
- `created_at`
- `updated_at`

### 2) `feedback_entries`
Append-only entries for the conversation-like audit trail, but structured.

Fields:
- `id`
- `feedback_request_id`
- `entry_type` (`delivery_submitted`, `revision_requested`, `resubmitted`, `approved`, `reopened`, `note`)
- `author_name`
- `author_role` (`operator`, `owner`, `agent`)
- `body`
- `structured_payload jsonb`
- `created_at`

### 3) Optional denormalized task fields for V1 UX
To keep UI simple, expose on task/work item:
- `review_status` (`not_requested`, `awaiting_review`, `revision_requested`, `in_revision`, `ready_for_rereview`, `approved`, `reopened`)
- `last_feedback_request_id`

If schema churn is a concern, these can be derived server-side first.

---

## Status model
### Feedback request statuses
Recommended V1 statuses:
- `awaiting_review` — work delivered and waiting for operator decision
- `revision_requested` — operator requested changes
- `in_revision` — owner/agent has accepted and work is being revised
- `ready_for_rereview` — updated work submitted, waiting again
- `approved` — output accepted
- `reopened` — previously approved/completed work reopened for further changes
- `canceled` — review path intentionally abandoned/invalidated

### Decision statuses
Keep a separate lightweight decision field:
- `pending`
- `changes_requested`
- `approved`
- `reopened`

This keeps the object readable:
- workflow status = where it is now,
- decision status = last operator decision.

---

## State transitions
### Happy path
1. Task marked complete / delivered
2. Feedback request created with `awaiting_review`
3. Operator approves
4. Feedback request becomes `approved`
5. Task remains done and project timeline records approval

### Revision path
1. Task marked complete / delivered
2. Feedback request `awaiting_review`
3. Operator submits revision request with notes
4. Feedback request becomes `revision_requested`
5. Underlying task returns to active revision state (`in_progress` or equivalent)
6. Owner resubmits updated work
7. Feedback request becomes `ready_for_rereview`
8. Operator approves or requests another revision round

### Reopen path
1. Previously approved task is reopened by operator
2. New feedback entry with reason is added
3. Feedback request becomes `reopened`
4. Underlying task re-enters active work state
5. On resubmission, request becomes `ready_for_rereview`

---

## Required events/signals
Add canonical user-facing events:
1. `delivery_submitted`
2. `feedback_requested` (optional creation event if distinct)
3. `revision_requested`
4. `revision_started`
5. `delivery_resubmitted`
6. `delivery_approved`
7. `delivery_reopened`

Signal priority recommendation:
- reopened > revision_requested > awaiting_review > approved > progress/activity

Copy rule:
Signals should say what happened, what object changed, and whether action is needed.

Example:
> Revision requested for onboarding flow. Update the first-run checklist and shorten the empty-state copy. Re-review needed after resubmission.

---

## Core UX
### 1) Review entry point on task/project detail
For any completed/delivered task, show a review card with:
- current review status
- latest delivery summary
- latest decision
- timestamp
- primary actions:
  - Approve
  - Request revisions
  - Reopen

### 2) Structured “Request revisions” form
Fields:
- `summary` — short label for the revision round
- `what needs to change` — required
- `reason / expected outcome` — optional but recommended
- `severity` — low / medium / high
- `blocking` — yes/no
- `target area tags` — optional preset tags like copy, UX, frontend, backend, QA

V1 rule: requesting revisions requires written notes.

### 3) Resubmission UX
Owner/agent can mark a revision as ready again with:
- updated delivery summary
- optional response note: what changed

This updates the same feedback request rather than creating chat noise.

### 4) Approval UX
Approval should be one-click with optional note.

Effect:
- feedback request status -> `approved`
- task remains done/completed
- event added to project timeline

### 5) Reopen UX
Reopen requires a reason.

Effect:
- review status -> `reopened`
- underlying task returns to active work state
- signal appears in project and dashboard views

### 6) Queue surfaces
Add lightweight filters/views:
- **Needs review** — `awaiting_review` + `ready_for_rereview`
- **In revision** — `revision_requested` + `in_revision` + `reopened`

Recommended locations:
- dashboard “Needs your review” panel
- project detail local section
- optional dedicated `/feedback` page later; not required for first release if dashboard + project views are enough

---

## Routing and behavior rules
1. Completing a task should not imply final acceptance.
2. If a delivered task is reviewable, the system should create or surface a feedback request automatically.
3. Requesting revisions should move the underlying task back out of terminal completion.
4. Re-review should happen on the same feedback request thread/object until approved or canceled.
5. Reopen should preserve prior approval history rather than overwrite it.
6. Feedback actions must create durable events on the project timeline.
7. Dashboard/project counts should distinguish:
   - pending approvals,
   - awaiting review,
   - in revision.
8. Approval queue and feedback queue should remain conceptually separate in copy and filters.

---

## Suggested copy model
Use explicit language:
- “Approve delivery”
- “Request revisions”
- “Ready for re-review”
- “Reopen work”
- “Awaiting review”
- “In revision”

Avoid vague labels like:
- “comment”
- “reply”
- “chat”
- “message thread”

This keeps the workflow operational rather than conversational.

---

## Acceptance criteria
### Functional
1. A completed task can be reviewed in-product without Telegram.
2. Operator can approve, request revisions, or reopen from project context.
3. Requesting revisions requires a written note.
4. Revisions route the underlying task back into active work.
5. Resubmission returns the item to a reviewable state.
6. Approval is recorded with actor and timestamp.
7. Reopen is recorded with actor, timestamp, and reason.
8. Project timeline shows each decision and resubmission in order.
9. Dashboard or project view clearly surfaces items awaiting review and in revision.

### UX
10. A non-technical operator can understand the difference between approvals and revisions from the UI copy alone.
11. An operator can tell the latest state of a deliverable in one glance.
12. Review actions do not require opening raw logs or Telegram context.

### Data / auditability
13. All review actions are attributable and timestamped.
14. Previous decisions are preserved after reopen.
15. Feedback history can reconstruct the full post-delivery loop for a task.

---

## Recommended V1 release slice
### Must ship first
1. Review card on project task detail
2. Feedback request object + statuses
3. Request revisions form with required note
4. Resubmission flow
5. Approve delivery action
6. Reopen action with required note
7. Timeline/event logging
8. Dashboard/project surfacing for review/revision counts

### Can wait until V1.1
- dedicated feedback inbox page
- target-area tagging/reporting
- templates for common revision reasons
- richer artifact linking
- reviewer SLA aging

---

## Open product decisions
1. Should feedback requests be created automatically for every completed task, or only for tasks flagged as needing explicit review?
   - Recommendation: auto-create for completed delivery tasks in V1.
2. Should reopen create a new feedback request or reopen the latest one?
   - Recommendation: reuse the latest request if the deliverable is still the same unit of work; preserve reopen as an entry/event.
3. Should “approved” be required before a project can be considered fully complete?
   - Recommendation: yes for tasks marked reviewable, but not as a universal rule for every task type.
4. Should revision severity affect dashboard prominence?
   - Recommendation: yes, same principle as approvals.

---

## Bottom line
The right V1 is not “add comments.”

The right V1 is a compact acceptance-and-revision workflow that turns delivered work into an explicit loop:

**delivered -> reviewed -> revisions or approval -> re-review -> accepted**

That matches Command Center’s product direction: structured human-in-the-loop delivery with explicit states, routing, and audit trail.
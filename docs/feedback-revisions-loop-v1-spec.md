# Command Center V1 — Delivery Feedback & Revisions Loop Spec

## Goal
Add a first-class in-product workflow for post-delivery feedback so operators can review delivered work, approve it, request specific revisions, or reopen accepted work without falling back to Telegram.

This must be a structured review loop, not a generic chat surface.

---

## Problem
Today, once a task is marked done, there is no native Command Center path for the operator to say:
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
4. Route revision requests back into the delivery workflow with exact, implementation-ready state changes.
5. Show current review state in project context and recent signals.
6. Keep the flow lightweight enough for internal V1.

## Non-goals
- Generic back-and-forth chat threads.
- Multi-reviewer workflows or formal stakeholder voting.
- Version diffing across artifacts.
- Customer-facing commenting or external client portals.
- Automatic agent execution from freeform feedback.
- Rich annotation on images/files in V1.
- Replacing the approvals system.

---

## Canonical V1 concept
Introduce a first-class **Feedback Request** object for delivered work.

### Canonical review unit
For V1, the canonical review unit is **one project task / work item (`sprint_items.id`)**.

Rules:
- Every feedback request must belong to exactly one task.
- A feedback request may reference the latest related `job_id`, `agent_id`, or artifacts for context, but those are secondary.
- Review state must be surfaced from the task level in UI and reporting.
- A single task can have multiple delivery attempts over time, but only **one active feedback request** at a time.
- Re-review rounds stay on the same feedback request until it is resolved or canceled.

Why this is the V1 unit:
- the repo’s current durable workflow primitive is the task/work item,
- task status already drives project progress,
- approvals and jobs already coexist as separate concepts,
- task-level review avoids inventing a second competing delivery object.

### What a feedback request represents
A feedback request is created when a task enters a reviewable done state or when an operator explicitly opens review on a delivered task. It captures:
- what task was delivered,
- who is reviewing,
- current review workflow status,
- latest operator decision,
- structured revision notes,
- the current review round count,
- whether the task was reopened after approval.

This is distinct from:
- **Approvals** = trust/risk decision gates during delivery.
- **Feedback requests** = post-delivery acceptance and revision loop for the delivered output of a task.

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
- Review action entry point from project task detail.
- Structured feedback form.
- Revision loop statuses.
- Reopen after approval.
- Timeline/events for all review actions.
- Dashboard/project signals for items awaiting review or revision.
- Simple queue/filter for “Needs review” and “In revision”.
- Exact mapping between feedback states and existing task states.

### Out of scope
- Multiple assignees or approval chains inside feedback.
- Inline artifact annotation.
- Artifact version comparison UI.
- Public share links.
- SLA automation/escalations.
- Granular permissions beyond current internal model.
- Freeform chat/thread UX.

---

## Object model
### 1) `feedback_requests`
Recommended canonical fields:
- `id`
- `project_id`
- `task_id` required
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
- `latest_submission_at` nullable
- `resolved_at` nullable
- `active_round_number` default `1`
- `reopened_count` default `0`
- `created_at`
- `updated_at`

Constraints:
- unique active request per `task_id` where `status` not in (`approved`, `canceled`)
- `task_id` is the canonical foreign key; `job_id` is contextual only

### 2) `feedback_entries`
Append-only audit entries for the review loop.

Fields:
- `id`
- `feedback_request_id`
- `round_number`
- `entry_type` (`delivery_submitted`, `revision_requested`, `revision_started`, `delivery_resubmitted`, `delivery_approved`, `delivery_reopened`, `note`)
- `author_name`
- `author_role` (`operator`, `owner`, `agent`)
- `body`
- `structured_payload jsonb`
- `created_at`

V1 rule:
- `feedback_entries` is an append-only audit log.
- No edits or deletions to prior entries except admin-level data correction outside product UX.

### 3) Task projection fields for V1 UX
Expose on task/work item as derived fields or denormalized fields:
- `review_status` (`not_requested`, `awaiting_review`, `revision_requested`, `in_revision`, `ready_for_rereview`, `approved`)
- `last_feedback_request_id`
- `last_feedback_decision_at`
- `review_required` boolean

Note: `reopened` is treated as an event and transient condition, not a long-lived separate terminal review state in V1.

---

## Status model
### Feedback request statuses
Recommended V1 statuses:
- `awaiting_review` — first delivery submitted; waiting for operator decision
- `revision_requested` — operator requested changes; owner has not yet acknowledged / resumed work
- `in_revision` — task is back in active work and changes are underway
- `ready_for_rereview` — revised work submitted; waiting again for operator decision
- `approved` — output accepted
- `canceled` — review path intentionally abandoned or superseded by task cancellation

### Decision statuses
Keep a separate lightweight decision field:
- `pending`
- `changes_requested`
- `approved`
- `reopened`

Interpretation:
- workflow status = where the review loop is now,
- decision status = last operator decision.

### Existing task/work-item statuses
Current repo-supported task statuses are:
- `todo`
- `in_progress`
- `done`
- `blocked`
- `cancelled`

### Exact mapping: review state -> task state
This is the required V1 mapping.

| Feedback request status / event | Task status | Meaning |
| --- | --- | --- |
| `not_requested` | existing task status | no review loop yet |
| `awaiting_review` | `done` | work is delivered and waiting for operator review |
| `revision_requested` | `todo` | operator has sent revisions, but owner has not yet resumed execution |
| `in_revision` | `in_progress` | owner/agent is actively addressing requested changes |
| `ready_for_rereview` | `done` | revised delivery submitted; waiting for operator review |
| `approved` | `done` | review loop resolved positively |
| task blocked while in review loop | `blocked` | delivery cannot proceed due to an external blocker; keep feedback status unchanged unless explicitly canceled |
| task canceled while in review loop | `cancelled` | feedback request becomes `canceled` |
| reopen event on an approved task | immediate task transition to `todo`, then `in_progress` when work resumes | approved work has been put back into active delivery |

Why `todo` for `revision_requested`:
- it cleanly distinguishes “operator sent changes” from “owner actively working on them,”
- it avoids overloading `in_progress` before anyone has actually resumed execution.

### Exact mapping: task state -> review projection
- Task `done` + no active feedback request + `review_required = false` -> `review_status = not_requested`
- Task `done` + active feedback request in `awaiting_review` -> `review_status = awaiting_review`
- Task `todo` + active feedback request in `revision_requested` -> `review_status = revision_requested`
- Task `in_progress` + active feedback request in `in_revision` -> `review_status = in_revision`
- Task `done` + active feedback request in `ready_for_rereview` -> `review_status = ready_for_rereview`
- Task `done` + latest resolved feedback request approved and no newer active request -> `review_status = approved`
- Task `blocked` during an active feedback loop -> preserve the active feedback request status and show a blocked badge on the task
- Task `cancelled` -> no actionable review state; latest request should be `canceled`

---

## Auto-creation policy
Feedback requests should **not** be auto-created for every task universally.

### Auto-create eligibility for V1
Auto-create a feedback request only when all are true:
1. task transitions to `done`
2. task is marked `review_required = true` or belongs to a task type configured as reviewable
3. there is no active feedback request already attached to the task
4. task is not `cancelled`

### Default recommendation for V1
- Default `review_required = true` for operator-facing delivery tasks.
- Default `review_required = false` for pure internal/admin chores unless explicitly flagged.

Examples that should auto-create:
- shipped UI/task deliverable
- revised copy requested by operator
- QA-signoff-ready task deliverable
- any task whose completion is intended to be reviewed by the operator

Examples that should not auto-create:
- housekeeping task
- internal setup work with no operator-facing output
- tasks already superseded or canceled

### Manual creation / surfacing rules
If a task is already `done` and reviewable but has no active feedback request, the operator may manually open review from task detail.

V1 invariant:
- automatic creation and manual creation must produce the same object type and same lifecycle.

---

## State transitions
### Happy path
1. Task marked `done`
2. Eligible feedback request created with `awaiting_review`
3. `delivery_submitted` entry created
4. Operator approves
5. Feedback request becomes `approved`
6. Task remains `done`
7. Timeline records approval and review closure

### Revision path
1. Task marked `done`
2. Feedback request `awaiting_review`
3. Operator submits revision request with required notes
4. Feedback request becomes `revision_requested`
5. Task moves from `done` -> `todo`
6. Owner/agent resumes work
7. Feedback request becomes `in_revision`
8. Task moves from `todo` -> `in_progress`
9. Owner resubmits updated work
10. Feedback request becomes `ready_for_rereview`
11. Task moves from `in_progress` -> `done`
12. Operator approves or requests another revision round on the same feedback request

### Reopen path
1. Latest feedback request is `approved`
2. Operator chooses reopen and provides required reason
3. No new feedback request is created if the same task remains the same review unit
4. Existing latest feedback request receives `delivery_reopened` entry
5. `decision_status` becomes `reopened`
6. Feedback request workflow status becomes `revision_requested`
7. `reopened_count` increments
8. Task moves from `done` -> `todo`
9. When work resumes, feedback request becomes `in_revision` and task moves to `in_progress`

### Repeated revision rounds
- Repeated revision rounds stay on the same feedback request.
- Increment `active_round_number` only when the operator requests a new revision round after a submission.
- Each round must have at most one operator decision outcome in force at a time.
- V1 does not impose a hard cap on rounds, but UI should surface round count once `active_round_number >= 2`.

---

## Ownership, permissions, and state transitions after revision request
### Who can act in V1
- **Operator** can approve, request revisions, reopen, and add operator notes.
- **Owner/agent** can mark revision work started, add constrained status notes, and resubmit for re-review.
- Non-operator internal viewers can read but cannot decide review outcomes unless they already hold operator-equivalent permissions in the current model.

### Required transition ownership
- `awaiting_review` -> `approved` only operator
- `awaiting_review` -> `revision_requested` only operator
- `approved` -> reopen flow only operator
- `revision_requested` -> `in_revision` owner/agent action or automatic when task status first changes to `in_progress`
- `in_revision` -> `ready_for_rereview` owner/agent resubmission
- `ready_for_rereview` -> `approved` only operator
- `ready_for_rereview` -> `revision_requested` only operator

### After revision request
Immediately after operator requests revisions:
- operator decision becomes authoritative latest decision,
- task is no longer considered accepted,
- task leaves terminal review completion,
- owner remains owner of the task unless reassigned through normal task mechanics,
- approvals remain separate and do not auto-resolve the feedback loop.

V1 does **not** auto-reassign ownership or create a new child task.
The revision work stays attached to the same canonical task.

---

## Notes and thread behavior constraints
V1 must not drift into generic chat.

### Allowed note types
Only these note types are allowed in V1:
1. operator revision request note
2. operator reopen reason
3. owner/agent resubmission note
4. short contextual note attached to a review transition

### Disallowed in V1
- freeform back-and-forth discussion thread
- emoji/reactive chatter
- nested replies
- @mentions/chat-room behavior
- long-running conversation detached from a review transition

### UX rule
A note should exist to explain a review decision or a resubmission, not to create an ongoing conversation lane.

### Product copy rule
Use labels like:
- “Revision request”
- “Resubmission note”
- “Reopen reason”
- “Review history”

Do **not** use labels like:
- “chat”
- “thread” as a primary object name
- “conversation”
- “message feed”

---

## Reopen and history semantics
### History preservation rules
- Feedback history is append-only.
- Approval history is never overwritten by reopen.
- Reopen does not erase prior approval; it records a newer operator decision.
- The latest decision controls the current state; prior decisions remain visible in history.

### Reopen semantics
For V1, reopen means:
- this task was previously accepted,
- that acceptance is no longer the current truth,
- the same task has returned to revision flow,
- prior approval still exists as historical fact.

### Same-request vs new-request rule
- Reopen the **latest feedback request** if the operator is still reviewing the same canonical task.
- Create a **new feedback request** only if a future version of the product introduces a different review unit; not needed in V1.

### Audit reconstruction requirement
A reviewer must be able to reconstruct, from entries alone:
1. first submission,
2. all revision rounds,
3. approval timestamps,
4. reopen events,
5. final current status.

---

## Coexistence with approvals
Approvals and feedback requests must coexist without ambiguity.

### Approval vs feedback precedence rules
1. **Approvals do not satisfy feedback review.** An approval can exist while the task still needs delivery review.
2. **Feedback approval does not resolve pending approvals.** A delivered output can be accepted while a separate trust/risk gate still exists elsewhere.
3. If both exist, UI must show them as separate objects with separate queues and labels.
4. A task cannot be considered fully clear of human decisions until both are resolved when both are applicable.
5. If an approval blocks execution, the task may remain `blocked`; feedback status should remain what it was, not silently advance.
6. If the operator requests revisions after a prior approval gate was approved, the task returns to active work regardless of that prior approval history.

### Practical precedence for operators
- **Execution precedence:** blocking approvals govern whether work can proceed.
- **Acceptance precedence:** feedback request governs whether delivered output is accepted.

This is why both systems remain first-class and separate.

---

## Required events, timeline, and signal mapping
BuildBeast M1 signal kinds are:
- `blocked`
- `approval`
- `completed`
- `progress`
- `activity`

Feedback review must map into that existing taxonomy rather than invent a new signal kind.

### Canonical review events
1. `delivery_submitted`
2. `revision_requested`
3. `revision_started`
4. `delivery_resubmitted`
5. `delivery_approved`
6. `delivery_reopened`
7. `feedback_request_canceled`

### Event -> signal kind mapping
| Event | Signal kind | Why |
| --- | --- | --- |
| `delivery_submitted` | `completed` | a delivery was completed and now needs review |
| `revision_requested` | `blocked` | operator action is needed before the task can be considered accepted |
| `revision_started` | `progress` | work resumed on requested changes |
| `delivery_resubmitted` | `completed` | a new delivery is ready for review |
| `delivery_approved` | `completed` | acceptance completed |
| `delivery_reopened` | `blocked` | previously accepted work is no longer accepted and needs attention |
| `feedback_request_canceled` | `activity` | administrative closure, usually not a primary completion signal |

### Signal priority recommendation
- `blocked` > `approval` > `completed` > `progress` > `activity`

Implication:
- `revision_requested` and `delivery_reopened` should outrank ordinary completion signals.
- A plain approved delivery should not outrank unresolved blocking items.

### Copy rule
Signals should say what happened, what object changed, and whether action is needed.

Example:
> Revisions requested for onboarding flow. Update the first-run checklist and shorten the empty-state copy. Re-review needed after resubmission.

---

## Core UX
### 1) Review entry point on task detail
For any reviewable task, show a review card with:
- current review status
- latest delivery summary
- latest decision
- timestamp
- primary actions when allowed:
  - Approve delivery
  - Request revisions
  - Reopen work

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

This updates the same feedback request and appends a new entry.

### 4) Approval UX
Approval should be one-click with optional note.

Effect:
- feedback request status -> `approved`
- decision status -> `approved`
- task remains `done`
- event added to timeline and signals

### 5) Reopen UX
Reopen requires a reason.

Effect:
- append `delivery_reopened` entry
- feedback request workflow status -> `revision_requested`
- decision status -> `reopened`
- task -> `todo`
- signal appears in project and dashboard views

### 6) Queue surfaces
Add lightweight filters/views:
- **Needs review** — `awaiting_review` + `ready_for_rereview`
- **In revision** — `revision_requested` + `in_revision`

Recommended locations:
- dashboard “Needs your review” panel
- project detail local section
- optional dedicated `/feedback` page later; not required for first release if dashboard + project views are enough

---

## Routing and behavior rules
1. Completing a task must not imply final acceptance.
2. Feedback requests only auto-create for eligible reviewable tasks.
3. Requesting revisions moves the underlying task out of terminal completion.
4. Re-review happens on the same feedback request until approved or canceled.
5. Reopen preserves prior approval history rather than overwriting it.
6. Feedback actions create durable events on the project timeline.
7. Dashboard/project counts distinguish:
   - pending approvals,
   - awaiting review,
   - in revision.
8. Approval queue and feedback queue remain conceptually separate in copy and filters.
9. There can be only one active feedback request per task in V1.
10. A blocked task in the review loop remains blocked at the task layer without silently changing review decision history.

---

## Edge-case policy decisions
1. **Repeated revision rounds**: allowed on the same feedback request; increment round number each time the operator requests another revision after a submission.
2. **Operator requests revisions twice in a row without owner action**: update the latest `revision_requested` entry set and keep task at `todo`; do not create a second active request.
3. **Owner resubmits with no note**: allowed, but delivery summary is still required.
4. **Task is canceled mid-review**: task -> `cancelled`, feedback request -> `canceled`, history preserved.
5. **Task becomes blocked mid-revision**: task -> `blocked`; feedback request remains `revision_requested` or `in_revision` depending on whether work had started.
6. **Operator approves after several rounds**: same request resolves to `approved`; prior rounds remain visible.
7. **Operator reopens long after approval**: same latest feedback request is reopened as long as the canonical task remains the same.
8. **Approval and feedback both pending**: show both; do not collapse one into the other.
9. **Non-reviewable done tasks**: no feedback request is auto-created and task can remain simply `done`.

---

## Suggested copy model
Use explicit language:
- “Approve delivery”
- “Request revisions”
- “Ready for re-review”
- “Reopen work”
- “Awaiting review”
- “In revision”
- “Review history”

Avoid vague labels like:
- “comment”
- “reply”
- “chat”
- “message thread”

---

## Acceptance criteria
### Functional
1. A completed reviewable task can be reviewed in-product without Telegram.
2. Operator can approve, request revisions, or reopen from project context.
3. Requesting revisions requires a written note.
4. Revisions route the underlying task back into active work using current task statuses.
5. Resubmission returns the item to a reviewable state on the same feedback request.
6. Approval is recorded with actor and timestamp.
7. Reopen is recorded with actor, timestamp, and reason.
8. Project timeline shows each decision and resubmission in order.
9. Dashboard or project view clearly surfaces items awaiting review and in revision.
10. Auto-creation only occurs for review-eligible tasks.
11. Review events map into the existing signal taxonomy without introducing a new signal kind.
12. Approvals and feedback requests remain visibly separate.

### UX
13. A non-technical operator can understand the difference between approvals and revisions from the UI copy alone.
14. An operator can tell the latest state of a deliverable in one glance.
15. Review actions do not require opening raw logs or Telegram context.
16. The UI does not behave like a generic chat thread.

### Data / auditability
17. All review actions are attributable and timestamped.
18. Previous decisions are preserved after reopen.
19. Feedback history can reconstruct the full post-delivery loop for a task.
20. There is at most one active feedback request per task.

---

## Recommended V1 release slice
### Must ship first
1. Review card on project task detail
2. Feedback request object + statuses
3. Exact mapping to current task statuses
4. Request revisions form with required note
5. Resubmission flow
6. Approve delivery action
7. Reopen action with required note
8. Timeline/event logging
9. Dashboard/project surfacing for review/revision counts
10. Auto-creation policy for reviewable done tasks

### Can wait until V1.1
- dedicated feedback inbox page
- target-area tagging/reporting
- templates for common revision reasons
- richer artifact linking
- reviewer SLA aging
- formal policy config UI for `review_required`

---

## Resolved product decisions for V1
1. **Canonical review unit**: the task/work item (`sprint_items.id`).
2. **Auto-creation rule**: only for review-eligible tasks that move to `done` and do not already have an active request.
3. **Reopen behavior**: reopen the latest feedback request for the same task; do not create a new request.
4. **Task-state mapping**: use existing statuses only — `todo`, `in_progress`, `done`, `blocked`, `cancelled`.
5. **Approvals coexistence**: approvals and feedback remain separate first-class systems with separate queues and no implied cross-resolution.
6. **Signal mapping**: reuse existing signal kinds (`blocked`, `completed`, `progress`, `activity`) rather than inventing a new feedback signal type.
7. **Repeated rounds**: allowed on one request; surfaced via round number, not via child threads.
8. **Thread behavior**: constrained review history only, not chat.

---

## Bottom line
The right V1 is not “add comments.”

The right V1 is a compact acceptance-and-revision workflow anchored on the existing task/work-item model:

**done task -> review -> revisions or approval -> re-review -> accepted**

That matches Command Center’s product direction: structured human-in-the-loop delivery with explicit states, routing, durable history, and readable signals.
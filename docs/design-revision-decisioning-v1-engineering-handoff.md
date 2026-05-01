# Command Center V1 — Design Revision Decisioning V1 Engineering Handoff

## Status
Ready for implementation planning

## Objective
Move design revision decisioning onto the Command Center V1 product page so Kris can review submitted mockup candidates and move the work forward without creating a new revision request.

This handoff turns the approved product decisions into a grounded implementation shape using the repo’s current review/revision system.

---

## Locked product decisions

1. The **product page** is the workflow control surface.
2. Mockup/artifact pages are **read-only review artifacts**.
3. A revision remains **one continuous workflow object**.
4. Do **not** create a new revision request just to communicate a decision.
5. V1 product actions are:
   - **Select Direction**
   - **Request Another Pass**
   - **Approve for Implementation**
6. Hybrid feedback in V1 is handled as:
   - selected base direction
   - notes describing what to borrow
7. Event log remains the source of truth.

---

## Recommended implementation strategy

Use the **existing milestone review/revision infrastructure** as the base instead of inventing a second workflow object.

That means V1 should extend current review entities already present in the repo:
- `milestone_submissions`
- `submission_feedback_items`
- `agent_events`
- `sprints.delivery_review_status`
- `sprint_items.review_status`

### Key engineering decision
For V1, **ship the new product workflow as a projection over the existing review model**.

Do not block the feature on a broad DB model rewrite.

### Recommended projection mapping
Use these product labels in UI:
- `decision_needed`
- `needs_revision`
- `approved_for_implementation`
- `implemented`

Back them with the current lower-level model initially:
- product `decision_needed` -> existing delivery review `pending`
- product `needs_revision` -> existing delivery review `rejected` / `changes_requested`
- product `approved_for_implementation` -> existing delivery review `approved`
- product `implemented` -> existing milestone/task completion state after approved implementation work ships

This keeps V1 fast and low-risk while preserving the desired product language.

---

## User-facing V1 behavior

### On `/projects/[id]`
For any reviewable milestone/submission with design candidates:
- show a dedicated **Revision Decision Card**
- show candidate count, artifact link(s), latest submission summary, latest update timestamp, and current decision state
- allow the operator to take one of the 3 V1 actions from that card

### Action outcomes
#### 1. Select Direction
Required:
- choose one candidate

Optional:
- notes
- hybrid instructions in notes
- toggle: `Requires another design pass before implementation`

Effect:
- records direction selection against the current submission
- routes back to design owner
- does not create a new top-level revision request

#### 2. Request Another Pass
Required:
- notes

Effect:
- records requested changes
- keeps workflow on the same revision lineage
- routes back to design owner
- reuses existing revision reopening/redispatch path where applicable

#### 3. Approve for Implementation
Required:
- choose approved candidate or approved submission context

Optional:
- implementation notes

Effect:
- marks direction as final for build
- routes to implementation owner
- leaves artifact pages read-only

---

## Route and component touchpoints

## Primary route
### `src/app/projects/[id]/page.tsx`
This is the main product-page implementation surface.

#### Required changes
- Add a **Revision Decision Card** into the milestone/review section for milestones with active review submissions.
- Surface:
  - revision/milestone name
  - current decision state
  - latest submission summary
  - candidate count
  - artifact link CTA
  - latest activity timestamp
  - primary action buttons
- Keep this as the canonical workflow surface.
- Do not move decisioning into task cards or artifact pages.

#### Notes
The page already has strong review-aware milestone state (`reviewSummary`, `reviewRequest`, `reviewArtifacts`, `deliveryReviewStatus`). Build on that.

---

## Existing component to extend or replace
### `src/components/project/revision-request-card.tsx`
Current behavior is biased toward “request changes” only.

#### Decision
Refactor this into a broader **revision decision surface** instead of keeping it as a one-way revision-request form.

#### Recommended direction
Either:
- rename to `revision-decision-card.tsx`, or
- keep file name for now but expand it to handle all 3 decision actions

#### V1 responsibilities
- render summary state for latest submission
- open action-specific modals
- submit decision payloads
- refresh project detail state after action

---

## Supporting surface
### `src/components/project/task-detail-modal.tsx`
This should stay a **supporting read-only context surface** for task-level review visibility.

#### V1 decision
Do not make this the primary decisioning surface for this feature.

#### Allowed changes
- show mirrored review status/history context if helpful
- link back to milestone/product-level review state
- no requirement to replicate the full decision UI here in V1

---

## Data and contract notes

## Current useful primitives already in repo
- `milestone_submissions` already stores:
  - revision number
  - status
  - summary
  - decision
  - decision notes
- `submission_feedback_items` already stores appended review/revision text
- `agent_events` already records workflow events
- `revision-reopen.ts` already handles sending work back into active execution

## V1 contract recommendation
Do the smallest extension that supports the 3 decisions cleanly.

### Recommended submission-level decision values
If the current schema allows safe extension, support values equivalent to:
- `direction_selected`
- `request_changes`
- `approved_for_implementation`

If enum/schema changes are risky, keep existing DB values and add product-level interpretation in UI/API.

### Recommended feedback item typing
Use or extend `submission_feedback_items.feedback_type` to distinguish:
- `direction_selection`
- `revision_request`
- `implementation_note`
- `hybrid_note`

If typed values are not available yet, preserve structured meaning in stored body payload first and normalize later.

### Candidate selection payload
V1 needs to persist at least:
- selected candidate id/label
- notes
- whether another design pass is required
- actor
- timestamp

This can live in one of two acceptable V1 forms:
1. structured fields on the latest submission row, or
2. structured event payload + feedback entry body

Recommendation: prefer **event payload + decision notes** if schema churn is a concern.

---

## API touchpoints

## Existing endpoint to preserve
### `src/app/api/projects/[id]/revision-requests/route.ts`
Keep this as the route for **Request Another Pass** behavior, but align naming/response semantics with the new product action language.

#### V1 expectation
This route should continue to:
- persist requested changes
- reopen/requeue work when needed
- log an event

But the UI should present it as **Request Another Pass**, not as “create a new revision request”.

## Recommended new endpoint(s)
Add product-page decision endpoints rather than overloading the artifact page.

### Option A — single endpoint
`POST /api/projects/:id/revision-decisions`

Actions:
- `select_direction`
- `request_another_pass`
- `approve_for_implementation`

### Option B — split endpoints
- `POST /api/projects/:id/revision-decisions/select-direction`
- `POST /api/projects/:id/revision-decisions/request-pass`
- `POST /api/projects/:id/revision-decisions/approve-implementation`

### Recommendation
Use **Option A** for V1.

Reason:
- one surface
- one audit pattern
- one place for validation and event logging
- easier for frontend modal wiring

### Minimum request contract
- `projectId` from route
- `sprintId`
- `submissionId`
- `action`
- `selectedCandidateId` nullable depending on action
- `notes` nullable/required depending on action
- `requiresAnotherPass` boolean for `select_direction`

### Minimum response contract
- `ok`
- normalized updated decision state
- updated submission metadata if available
- any reroute/redispatch summary

---

## Event logging requirements

Every action must create a durable `agent_events` entry.

### Required V1 event types
- `revision_direction_selected`
- `revision_another_pass_requested`
- `revision_approved_for_implementation`

### Required event payload fields
- `project_id`
- `sprint_id`
- `submission_id`
- `selected_candidate_id` when applicable
- `candidate_count` when known
- `notes`
- `requires_another_pass` when applicable
- `actor`
- `routed_to`

### Timeline copy examples
- `Direction selected for Content Planner 10.0 review set`
- `Another revision pass requested for Content Planner 10.0`
- `Content Planner 10.0 approved for implementation`

---

## Notification and routing rules

### Select Direction
Route to: **design owner only**

### Request Another Pass
Route to: **design owner only**

### Approve for Implementation
Route to: **implementation owner required**
Optional: design owner copied for visibility

### Engineering note
Follow the existing owner-resolution pattern already used in review/revision sync logic where possible instead of inventing a separate assignee resolver.

---

## UI component list for V1

### New or refactored components
- `RevisionDecisionCard`
- `SelectDirectionModal`
- `RequestAnotherPassModal`
- `ApproveForImplementationModal`
- optional small `RevisionCandidateList` subcomponent

### Existing components likely touched
- `src/app/projects/[id]/page.tsx`
- `src/components/project/revision-request-card.tsx`
- `src/components/project/task-detail-modal.tsx` (light touch only)
- `src/lib/project-detail-state.ts`
- `src/lib/project-detail-truth.ts`
- `src/lib/review-request-sync.ts`
- `src/lib/revision-reopen.ts`

---

## UX requirements for the product-page decision card

The card must show:
- revision/milestone title
- current state badge
- latest submission summary
- candidate count
- artifact links
- last updated timestamp
- latest decision summary if present

The card must support exactly these V1 actions:
- **Select Direction**
- **Request Another Pass**
- **Approve for Implementation**

### Modal requirements
#### Select Direction modal
- required candidate selection
- optional notes
- boolean/toggle for `requires another design pass before implementation`

#### Request Another Pass modal
- required notes
- optional attachment selection if already easy to support via current document flow

#### Approve for Implementation modal
- required selected candidate or explicit approved submission context
- optional implementation notes

---

## QA acceptance checklist

### Functional
- [ ] A submitted design revision can be actioned from `/projects/[id]` without creating a new revision request.
- [ ] The product page shows a revision decision card for eligible milestones/submissions.
- [ ] `Select Direction` requires a selected candidate.
- [ ] `Request Another Pass` requires notes.
- [ ] `Approve for Implementation` records final implementation approval.
- [ ] Hybrid feedback is possible via selected base direction + notes.
- [ ] Artifact/mockup pages remain read-only.
- [ ] Each action creates a durable event log entry.
- [ ] The correct next owner is routed/notified for each action.

### State and projection
- [ ] UI correctly projects `decision_needed`, `needs_revision`, and `approved_for_implementation` from underlying review state.
- [ ] Existing revision reopening behavior still works when another pass is requested.
- [ ] No second parallel revision object is created for simple direction decisions.

### Regression
- [ ] Existing review request flow for non-design review milestones is not broken.
- [ ] Existing task detail modal still renders review context correctly.
- [ ] Existing project detail recent signals still render after event additions.

---

## Out of scope for this slice
- Side-by-side candidate compare UI
- Dedicated hybrid-composition builder
- Inline artifact commenting/annotation
- Multi-reviewer approval logic
- Full workflow migration away from current milestone submission primitives

---

## Recommended implementation order

1. Add product-page revision decision card UI shell.
2. Add `select_direction` and `approve_for_implementation` API handling.
3. Re-label/refit the current revision request path as `Request Another Pass`.
4. Add event logging for all 3 actions.
5. Wire routing/owner notifications.
6. Add QA coverage for projection and regression.

---

## Bottom line
The best V1 move is **not** a new workflow system.

It is a focused product-page decision layer built on top of the repo’s current milestone review/revision primitives, with clean action semantics and durable events.
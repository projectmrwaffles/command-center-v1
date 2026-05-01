# Command Center V1 — Design Revision Decisioning V1
## Slice 1 Execution Packet

## Status
Ready to dispatch

## Assignment
- **Owner:** Pixel (Frontend Engineer)
- **QC Approver:** Shield (QA Auditor)

Owner and QC must remain separate.

---

## Slice objective
Ship the first working product-page decision surface for design revisions on `/projects/[id]` using the existing milestone review/revision model.

This slice is specifically for the **operator-facing UI and action wiring** for:
- `Select Direction`
- `Request Another Pass`
- `Approve for Implementation`

This slice must not introduce a second workflow system.

---

## Why this slice first
This is the smallest useful implementation slice because it proves the new workflow at the real control surface:
- the product page
- with the existing review primitives
- without waiting on a large schema rewrite

If this slice ships cleanly, the team can validate the workflow loop in the real product before investing in deeper modeling.

---

## Scope boundary

### In scope
- Product-page revision decision card on `/projects/[id]`
- Action-specific modal flows for the 3 V1 actions
- Frontend wiring to existing/new decision endpoints
- UI projection of current review state into product language
- Refreshing visible page state after action success
- Event-friendly payload submission for all 3 actions

### Out of scope
- Side-by-side compare UI
- Dedicated hybrid builder
- Artifact page workflow controls
- Full schema redesign
- Multi-reviewer flows
- Dashboard-wide triage expansion
- Deep task-modal workflow duplication

---

## User-visible outcome
On a project page with a submitted design review set, Kris can:
1. see a dedicated revision decision surface,
2. open the submitted artifacts,
3. choose a direction,
4. ask for another pass, or
5. approve a direction for implementation,

without creating a new revision request.

---

## Implementation requirements

### 1) Product-page decision card
Add a dedicated revision decision card on `/projects/[id]` for eligible reviewable milestones/submissions.

The card must show:
- milestone/revision title
- current decision state badge
- latest submission summary
- candidate count when available
- artifact/view link
- latest update timestamp
- latest decision note summary when available

### 2) Product-language state projection
Project current review state into the approved V1 language:
- `decision_needed`
- `needs_revision`
- `approved_for_implementation`
- `implemented`

This may remain a UI-layer projection over current lower-level review values.

### 3) Action modals
Implement separate modals for:

#### A. Select Direction
Fields:
- required selected candidate
- optional notes
- optional toggle: `Requires another design pass before implementation`

#### B. Request Another Pass
Fields:
- required notes

#### C. Approve for Implementation
Fields:
- required selected candidate or explicit approved submission context
- optional implementation notes

### 4) Action wiring
Wire each action to the appropriate backend path.

#### Required behavior
- `Select Direction` must not create a new revision request.
- `Request Another Pass` should reuse the current revision-request/reopen path where appropriate.
- `Approve for Implementation` must record final approval and route toward implementation.

### 5) Success handling
After any successful action:
- modal closes cleanly
- product page state refreshes
- updated review status is visible immediately
- duplicate submissions are prevented while request is in flight

---

## Recommended file touchpoints
Owner may adjust if repo reality demands, but expected touchpoints are:

- `src/app/projects/[id]/page.tsx`
- `src/components/project/revision-request-card.tsx` (or renamed replacement)
- `src/components/project/task-detail-modal.tsx` (only if needed for mirrored context)
- `src/lib/project-detail-state.ts`
- `src/lib/project-detail-truth.ts`
- `src/app/api/projects/[id]/revision-requests/route.ts`
- new or extended revision decision API route(s)

If additional files are touched, owner must justify why.

---

## Backend/API guidance for this slice

### Preferred V1 API shape
Use a single decision endpoint if feasible:
- `POST /api/projects/:id/revision-decisions`

Supported actions:
- `select_direction`
- `request_another_pass`
- `approve_for_implementation`

### Acceptable fallback
If implementing the consolidated endpoint would slow the slice materially, owner may:
- reuse the existing `revision-requests` route for `request_another_pass`, and
- add only the minimum new route(s) needed for `select_direction` and `approve_for_implementation`

This tradeoff is allowed only if clearly documented in the handoff.

---

## Acceptance criteria

### Functional
- [ ] A submitted design revision appears on `/projects/[id]` with a dedicated decision card.
- [ ] The operator can open artifact/mockup links from that card.
- [ ] The operator can trigger all 3 V1 actions from the product page.
- [ ] `Select Direction` requires a selected candidate.
- [ ] `Request Another Pass` requires notes.
- [ ] `Approve for Implementation` captures approved direction context.
- [ ] No action requires creating a brand-new revision request just to continue the same review loop.
- [ ] Artifact/mockup pages remain read-only.

### State / UX
- [ ] The visible product-page state uses the approved V1 product language.
- [ ] The state updates immediately after successful action submission.
- [ ] Action loading states prevent accidental duplicate submissions.
- [ ] The new decision UI does not displace the product page as the canonical workflow surface.

### Audit / workflow integrity
- [ ] Each action results in a durable event or decision record path.
- [ ] `Request Another Pass` still reopens/returns work through the existing revision loop.
- [ ] The implementation does not introduce a second parallel revision object.

---

## Verification standard
Owner must provide exact evidence, not narrative.

### Required commands
Run at minimum:
- `npm run lint`
- `npm run typecheck`
- `npm run verify:project-detail-revision-flow`

If new logic affects review-state projection materially, also run if still relevant:
- `npm run verify:pending-review-truth-guard`

### Required manual checks
Owner must manually validate:
1. product page shows the decision card for an eligible revision state
2. each modal opens and closes correctly
3. required field validation works
4. successful action refreshes visible project-page state
5. artifact link remains view-only and does not contain workflow controls

If a local seeded scenario is needed, owner must document exactly how it was set up.

---

## Owner required output
Owner handoff must include:
1. Objective
2. Scope completed
3. Files changed
4. What changed
5. Verification commands run
6. Verification results
7. Manual behavior checks
8. Status: DONE / INCOMPLETE / FAIL
9. Commit hash
10. Risks / follow-ups

---

## QC brief
Shield must independently verify:
- product page is the workflow control surface
- no new revision request is required for direction decisions
- the 3 V1 actions behave as specified
- state projection is coherent and not misleading
- existing revision flow behavior was not regressed

### QC required checks
- rerun the owner verification commands
- perform manual UI validation on `/projects/[id]`
- inspect the decision flow for accidental duplicate or conflicting workflow objects
- confirm action labels and copy match the approved product language

### QC verdict rules
- PASS only with command evidence and manual verification
- FAIL if workflow still requires a new revision request for simple decision feedback
- FAIL if artifact pages become workflow surfaces
- FAIL if the implementation introduces ambiguous or conflicting state behavior

---

## Known risks to watch
- Existing review/revision naming may leak into the product UI and confuse the workflow.
- Candidate identity may not yet be strongly modeled; V1 may need temporary payload-based selection handling.
- The current repo may conflate design-review and broader delivery-review patterns; owner should keep this slice narrowly scoped to the approved product behavior.

---

## Definition of done
This slice is done only when:
- the product-page decision card ships,
- all 3 actions are available,
- verification passes,
- QC independently passes,
- and the workflow no longer depends on creating a new revision request for direction decisions.

Without those, status is not DONE.
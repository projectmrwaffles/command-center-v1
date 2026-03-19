# Command Center V1 — Task Model Implementation Plan

_Last updated: 2026-03-19_

## Objective
Translate `docs/task-model-v1-spec.md` into the smallest safe engineering rollout plan for the current Command Center codebase.

This plan is intentionally implementation-oriented but **not** implementation itself. It is designed around the repo's current reality:
- tasks are stored in `public.sprint_items`
- task creation is currently `title + description`
- task editing is currently `status + notes`
- project progress is derived from raw task `status`
- project and dashboard reporting do not yet understand structured task intent
- the feedback/revisions spec already establishes the review-loop direction for reviewable tasks

The goal is to get to V1 structured tasks with the least schema churn, the least UI disruption, and the safest compatibility path.

---

## Current-state audit summary

### Current durable model
`public.sprint_items` currently contains:
- `id`
- `sprint_id`
- `project_id`
- `title`
- `description`
- `status`
- `assignee_agent_id`
- `assignee_user_id`
- `story_points`
- `position`
- timestamps

Relevant source of truth:
- `supabase/migrations/20250301130000_v1_schema.sql`

### Current create/edit behavior
Task create API (`src/app/api/projects/[id]/tasks/route.ts`):
- requires `title`
- optionally accepts `description` / `notes`
- always writes `status = 'todo'`
- does not capture structured task type, review policy, routing, or subtype fields

Task patch API (`src/app/api/projects/[id]/tasks/[taskId]/route.ts`):
- only normalizes `status`, `notes`, `title`
- allows direct status mutation
- has no concept of action-based transitions
- has no concept of revise vs edit

Project detail UI (`src/app/projects/[id]/page.tsx`):
- “New Task” modal is freeform title + description
- task detail modal exposes raw status dropdown
- task board buckets only by raw status
- no routing preview, review policy, task type, or revision entry point

Dashboard / project reporting:
- counts total, done, blocked, in progress
- does not distinguish discovery vs build vs QA etc.
- does not yet surface review-state counts from structured task metadata

### Implication
The current system is compatible with the spec's compatibility stance because `title`, `description`, and `status` already exist and can be retained. But it is **not** compatible with the spec's operator UX without adding structured fields and introducing a second-layer workflow model on top of the current status-only task flow.

---

## Recommended V1 productization stance

### Keep `sprint_items` as the canonical task table
Do **not** introduce a new work-item table for V1.

Reason:
- the spec explicitly preserves `sprint_items`
- the repo already uses `sprint_items` for project progress, project detail, event logging, and dashboard projections
- creating a new parallel task table would create migration and projection risk far beyond V1 needs

### Add a thin structured layer to `sprint_items`
The V1-safe path is:
1. keep legacy fields (`title`, `description`, `status`)
2. add a small set of typed columns for routing/review/reporting
3. put type-specific structured fields into one JSONB payload
4. treat generated title + structured description as projections, not new independent sources of truth

This is the smallest rollout that still supports the spec.

---

## Minimum viable schema changes

## 1) Add canonical V1 task structure to `public.sprint_items`
Recommended new columns:

### Required structured columns
- `task_type text`
  - enum/check-backed to the six V1 types:
    - `discovery_plan`
    - `design`
    - `build_implementation`
    - `content_messaging`
    - `qa_validation`
    - `internal_admin`

- `task_goal text`
  - short operator-entered intent statement

- `owner_team_id uuid null references public.teams(id)`
  - explicit routing projection for the owner lane

- `review_required boolean not null default false`
  - deterministic source of truth for whether the task should enter the review/revision loop

### Strongly recommended compatibility/projection columns
- `task_template_key text null`
  - stores the selected subtype or primary template key for quick filtering and reporting
  - examples: `audit_current_state`, `ui_mockups`, `backend_or_api`, `launch_messaging`, `qa_pass`, `coordination`

- `task_metadata jsonb not null default '{}'::jsonb`
  - stores type-specific fields
  - examples:
    - discovery: `planning_mode`, `target_area`, `decision_needed_by`
    - design: `design_output_type`, `surface`
    - build: `implementation_kind`, `target_environment`
    - content: `content_type`, `channel_or_surface`
    - QA: `qa_mode`, `subject_ref`
    - internal: `admin_action_type`

### Review-loop bridge fields
These match the feedback/revisions spec and should be added now or in the immediately-following review slice:
- `review_status text not null default 'not_requested'`
  - projection values from review spec:
    - `not_requested`
    - `awaiting_review`
    - `revision_requested`
    - `in_revision`
    - `ready_for_rereview`
    - `approved`

- `last_feedback_request_id uuid null`
- `last_feedback_decision_at timestamptz null`

These fields can be nullable/projection-first in V1 if the feedback tables are not landing in the exact same slice.

## 2) Do **not** remove or repurpose existing fields
Retain unchanged:
- `title`
- `description`
- `status`
- `assignee_agent_id`
- `assignee_user_id`

V1 rule:
- legacy fields remain the compatibility surface for existing APIs and UI code during rollout
- new structured fields become the canonical authoring surface for new tasks

## 3) Add database guardrails conservatively
V1-safe constraints:
- allow new structured columns to be nullable initially for legacy rows
- add check constraints for `task_type` and `review_status`
- default `review_required = false` at DB level, but application logic should set it deterministically from task type on create
- do **not** require `task_goal`, `owner_team_id`, or `task_type` for all historical rows in the first migration

This keeps the migration reversible and avoids breaking seed data or existing insert paths.

---

## Type system and metadata contract

## Application contract
Add a central task model module, likely under `src/lib/task-model.ts`, containing:
- the six canonical task types
- subtype option maps per type
- default `review_required` by type
- default owner-team recommendation by type
- title generation helper
- description/summary generation helper
- validation/parsing of `task_metadata`
- action-to-status transition map

This should be the single source of truth used by:
- create task API
- update/revise APIs
- project detail UI
- dashboard/project reporting

## Metadata shape recommendation
Use discriminated JSON by `task_type` rather than one untyped bucket.

Example shape:
```ts
{
  task_type: 'build_implementation',
  task_template_key: 'backend_or_api',
  task_metadata: {
    implementation_kind: 'backend_or_api',
    target_environment: 'web_app',
    spec_ref: 'doc_123',
    definition_of_done_note: '...'
  }
}
```

Reason:
- smallest DB change
- good compatibility with current Supabase usage
- avoids adding 12-20 sparse columns for subtype fields
- still allows deterministic reporting via `task_type` and `task_template_key`

---

## API rollout plan

## Phase 1 — additive API compatibility
Keep existing routes but extend their request/response contracts.

### `POST /api/projects/:id/tasks`
Current contract:
- accepts `title`, optional `description`

V1 target contract:
- accept either:
  1. legacy freeform payload, or
  2. new structured payload

Recommended structured create payload:
- `task_type`
- `task_goal`
- `owner_team_id` or `owner_team`
- `review_required?` override
- `task_template_key`
- `task_metadata`
- `context_note?`
- `linked_artifact_refs?`
- `assignee_agent_id?`
- `assignee_user_id?`
- `title_override?`

Create behavior:
- derive `review_required` from task type default unless override is allowed and present
- generate `title` from type + goal unless `title_override` exists
- write `description` as a structured summary + optional operator note
- write `status = 'todo'`
- write `review_status = 'not_requested'`

Compatibility behavior:
- if only legacy `title`/`description` is supplied, still create a task
- mark it as legacy-compatible using either:
  - null structured fields, or preferably
  - `task_type = 'internal_admin'` only if product agrees this should be the explicit fallback

Recommendation: **do not auto-map legacy freeform tasks to a fake task type during the first compatibility slice.** Leave them untyped/null and treat them as legacy tasks in UI until edited.

### `PATCH /api/projects/:id/tasks/:taskId`
Split behavior by intent rather than keeping a single raw patch forever.

Recommended V1-safe approach:
- keep `PATCH` for metadata edits
- narrow accepted fields over time
- support structured fields:
  - `task_goal`
  - `owner_team_id`
  - `review_required`
  - `task_template_key`
  - `task_metadata`
  - `context_note`
  - `linked_artifact_refs`
  - `assignee_*`
  - optional `title_override`
- keep `title`/`notes` patch compatibility temporarily for legacy tasks

Important rule:
- raw `status` patching should remain supported for compatibility at API level initially
- but primary UI should stop exposing raw status dropdown once action-based controls land

### Add an action endpoint for status transitions
Recommended new route:
- `POST /api/projects/:id/tasks/:taskId/actions`

Accepted actions:
- `start_work`
- `mark_blocked`
- `resume_work`
- `submit_delivery`
- `cancel_task`
- later: `request_revisions`, `start_revision`, `ready_for_rereview`, `approve_delivery`, `reopen_work`

Why add this:
- keeps action-based UX explicit
- avoids overloading freeform `PATCH`
- creates a clean bridge to feedback/revisions spec
- lets event logging become deterministic

### Add a revise endpoint
Recommended new route:
- `POST /api/projects/:id/tasks/:taskId/revise`

Request body:
- `revision_reason`
- `revision_summary`
- `what_needs_to_change`
- `expected_outcome?`

This should eventually create/update the feedback request loop per `docs/feedback-revisions-loop-v1-spec.md`.

V1-safe sequencing note:
- the task model rollout can ship before full revise implementation
- but the implementation plan should reserve this endpoint now so edit/revise do not collapse back together later

---

## UI rollout plan

## 1) Create flow: replace freeform-first modal
Current state:
- `src/app/projects/[id]/page.tsx` uses a simple modal with `Task name` and `Description`

V1 rollout:
- replace modal with a 3-5 step structured create flow in the same location first
- do **not** build a separate route/page before the behavior is proven

Recommended first-release create steps:
1. **Task type**
2. **Type-specific options**
3. **Task goal**
4. **Routing + review preview**
5. **Optional context / assignee**

Generated preview before save:
- title preview
- owner lane preview
- QC lane preview
- whether completion will enter review

Reason this is the smallest safe UI path:
- it upgrades the highest-value authoring moment
- it does not require redesigning the whole task board at once
- it fits the current modal-based interaction model

## 2) Task detail: separate edit from revise
Current state:
- same modal acts as task detail
- raw status dropdown + freeform notes

V1 rollout:
- keep modal/drawer pattern, but restructure sections:
  1. task type + structured fields
  2. goal + generated title
  3. assignment / owner lane
  4. review settings
  5. revision / review history (when available)

Primary actions should become buttons, not a status select:
- `Start work`
- `Mark blocked`
- `Resume work`
- `Submit delivery`
- `Cancel task`

For completed reviewable tasks:
- show `Request revisions`
- later show `Approve delivery` / `Reopen work` once feedback spec slice lands

## 3) Board/list surfaces: add structured labels without re-platforming the board
V1-safe incremental changes:
- keep board grouped by lifecycle status first
- add task-type pill on each card
- add review-state pill where applicable
- show owner team / assignee more explicitly

This preserves the existing board mental model while introducing structured task meaning.

## 4) Dashboard / project reporting
V1 project page should add:
- tasks by type
- awaiting review count
- in revision count
- blocked count
- done by type

Dashboard should add:
- needs review queue (`awaiting_review`, `ready_for_rereview`)
- in revision queue (`revision_requested`, `in_revision`)
- optional task-type breakdown per project card

Recommendation:
- compute these server-side first from `sprint_items`
- avoid a dedicated analytics table in V1

---

## Compatibility and migration strategy

## 1) Backward-compatible DB migration
Migration 1 should be additive only:
- add columns
- backfill defaults where harmless
- do not force historical tasks into structured completeness

## 2) Legacy row handling
Historical and freeform-created tasks will exist.
Treat them explicitly as `legacy` in product logic rather than pretending they are structured.

Recommended handling:
- if `task_type` is null, UI labels it as `Legacy task`
- edit surface can offer a one-time “Convert to structured task” affordance
- reporting should include an `Unstructured / legacy` bucket until backfill is complete

This is safer than silent inference from title/description.

## 3) No inference from prose in V1
Do **not** try to auto-classify old tasks from their existing title/description.

Reason:
- spec explicitly rejects prose inference as the source of truth
- wrong inference would create routing/reporting debt
- small internal data volumes do not justify the complexity

## 4) Optional low-risk backfill
If product wants cleaner reporting, do a manual/defaulted backfill only for rows created after schema launch or only for rows touched via edit.

Safer rule:
- legacy rows become structured when the operator edits and saves them through the new form
- otherwise they remain legacy

## 5) Status compatibility
Keep existing `status` values unchanged:
- `todo`
- `in_progress`
- `done`
- `blocked`
- `cancelled`

Do not introduce new lifecycle statuses at the task table level for V1.
Review/revision should project through `review_status`, not by mutating the task status vocabulary.

---

## Review / revisions integration strategy

This task-model rollout should be designed to plug directly into the feedback loop spec.

## Minimum task-model requirements to unblock the review loop
The task model slice should produce:
- deterministic `review_required`
- stable `task_type`
- stable `owner_team_id`
- `review_status` projection field
- action-based status controls

## Review-loop interaction contract
When task model V1 and feedback loop V1 are both present:
- `submit_delivery` on a reviewable task can create or update a feedback request
- reviewable `done` tasks surface review card actions
- revise is a structured action, never a generic edit of title/description/status

## Sequencing recommendation
Do **not** wait for the full feedback loop to ship before landing structured task creation.
But do ensure the task model names and fields match the feedback spec so there is no later rename churn.

---

## Event logging changes

Current events:
- `task_created`
- `task_updated`
- `task_deleted`

V1 task model should standardize richer payloads for existing events and add action-oriented events.

Recommended event additions:
- `task_started`
- `task_blocked`
- `task_resumed`
- `task_delivery_submitted`
- `task_review_required_changed`
- later, from feedback loop:
  - `revision_requested`
  - `revision_started`
  - `delivery_resubmitted`
  - `delivery_approved`
  - `delivery_reopened`

Payload should include, where available:
- `task_id`
- `title`
- `task_type`
- `task_goal`
- `owner_team_id`
- `review_required`
- `review_status`
- previous/new status when relevant

This matters because project signals and dashboard queues already rely on event + projection logic.

---

## Server-side reporting changes

## Project detail API (`/api/projects/:id`)
Extend returned tasks and stats to include:
- `task_type`
- `task_goal`
- `owner_team_id`
- `review_required`
- `review_status`
- `task_template_key`
- derived stats:
  - `tasksByType`
  - `awaitingReviewTasks`
  - `inRevisionTasks`
  - `legacyTaskCount`

## Dashboard data (`src/app/dashboard/page.tsx`)
Extend `needsYou`/project summaries with:
- review-needed items for operator queue
- in-revision counts
- task-type breakdown at summary level if cheap to compute

Keep first implementation as direct Supabase projections.
Avoid a custom rollup table until usage proves it is needed.

---

## Recommended build slices

## Slice 0 — schema + model constants
Owner goal:
- add additive schema columns
- introduce shared task-model constants/validation helpers
- no UX behavior change yet

Acceptance:
- migrations apply cleanly
- existing task flows still work
- typed helpers exist for task types/defaults/title generation

## Slice 1 — structured create path
Owner goal:
- upgrade create task API and project detail create modal to structured task creation
- preserve legacy compatibility path

Acceptance:
- operator can create all six task types
- title is generated
- review/routing preview appears before save
- created tasks persist structured fields
- old freeform creation path is retired from primary UI

## Slice 2 — structured detail/edit + action-based status controls
Owner goal:
- replace raw status dropdown in primary UI with action buttons
- add structured edit surface
- preserve legacy patch compatibility behind API

Acceptance:
- operator edits task details without raw field confusion
- `Start work` / `Mark blocked` / `Submit delivery` etc. drive status transitions
- progress sync remains correct

## Slice 3 — review-ready bridge
Owner goal:
- add `review_status` projection and wire reviewable `done` tasks toward feedback loop compatibility
- add dedicated revise entry point placeholder or first implementation

Acceptance:
- completed reviewable tasks are distinguishable from plain done tasks
- revise no longer means generic edit
- task model fields align with feedback spec

## Slice 4 — reporting + dashboard surfacing
Owner goal:
- add counts by type and review state on project/dashboard surfaces
- include legacy bucket until migration is complete

Acceptance:
- project page can answer what kind of work is active
- dashboard can answer what needs review vs what is in revision
- reporting no longer relies only on raw task count/status

## Slice 5 — optional cleanup/backfill
Owner goal:
- convert edited legacy tasks when touched
- optionally add admin-only migration helper/report for remaining legacy tasks

Acceptance:
- legacy footprint is visible and shrinking
- no automatic prose inference is introduced

---

## Recommended rollout order

### Smallest V1-safe order
1. schema additions + constants
2. structured create flow
3. action-based task detail controls
4. review bridge fields / revise entry point
5. dashboard + project reporting
6. optional legacy cleanup

Why this order:
- create flow gives immediate product value
- action-based status removes a major UX mismatch with the spec
- review bridge avoids painting the model into a corner
- reporting only becomes trustworthy once structured data exists

---

## Explicit decisions and tradeoffs

### Decision: JSONB for type-specific fields
Why:
- fastest safe rollout
- avoids over-normalization
- enough for V1 filtering when paired with `task_type` and `task_template_key`

### Decision: keep legacy fields as compatibility projections
Why:
- current code reads/writes them everywhere
- project progress and UI depend on them now
- replacing them wholesale would expand scope unnecessarily

### Decision: no prose inference for migration
Why:
- consistent with spec
- lower risk than “smart” backfill

### Decision: add action endpoint instead of only extending `PATCH`
Why:
- creates a durable workflow contract
- prevents future review/revision logic from devolving into raw status writes again

### Decision: report `legacy/unstructured` tasks explicitly
Why:
- honest migration state
- avoids fake precision in dashboards

---

## Risks and follow-ups

### Risk 1: UI tries to ship full review loop and task model in one slice
Mitigation:
- separate structured task creation from full feedback loop implementation
- only share compatible fields and action names first

### Risk 2: owner routing model is underspecified in current repo
Current reality:
- the repo already has team tables and project intake routing helpers
- task-level owner routing is not yet a strongly codified reusable system

Mitigation:
- V1 should store `owner_team_id` explicitly on task rows
- recommendation logic can be simple/defaulted first and improved later

### Risk 3: generated `description` becomes a second messy authoring surface
Mitigation:
- define one formatter for description projection
- store only compact structured summary + optional context note
- keep long-form prose out of the main create flow

### Risk 4: reporting complexity grows before data quality exists
Mitigation:
- add `legacy/unstructured` bucket from day one
- avoid claiming full task-type coverage until migration improves

### Risk 5: raw `status` edits remain reachable via old code paths
Mitigation:
- keep API compatibility initially
- remove raw status dropdown from primary UI as soon as Slice 2 lands
- move downstream code to action calls rather than freeform patches

---

## Definition of done for the planning slice
This planning deliverable is complete when Command Center has a clear V1-safe path that:
- keeps `sprint_items` as the task table
- introduces the minimum structured fields needed for the spec
- preserves existing progress/status compatibility
- separates create vs edit vs revise at the API/UI contract level
- avoids risky automatic backfill/inference
- defines a build order small enough to ship incrementally

---

## Recommended next owner/QC dispatch
### Owner: Bolt or Pixel depending on slice
- Bolt for schema/API Slice 0-1 scaffolding
- Pixel for create/detail UI Slice 1-2

### QC: Shield
Verification expectations for implementation slices:
- `npm run lint`
- `npm run typecheck`
- migration applies cleanly
- manual create/edit/status-action smoke test on project detail
- confirm legacy tasks still render and remain editable

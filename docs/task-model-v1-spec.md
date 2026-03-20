# Command Center V1 — Structured Task Model + Create/Edit/Revise UX Spec

## Purpose
Define a focused V1 task model for Command Center so operators create and revise work through structured, intention-driven task actions instead of open-ended freeform task authoring.

This spec is deliberately narrow:
- it keeps the existing implementation concept of project-scoped tasks/work items (`sprint_items`),
- it does not introduce a new generic work object,
- it aligns with the existing feedback/revisions V1 spec,
- it favors deterministic task templates and constrained actions over custom prose-heavy task creation.

---

## Problem to solve
The current task flow is too open-ended:
- users can create a task from a title + description alone,
- status is treated as a raw field instead of a guided workflow,
- reviewability is implicit instead of deterministic,
- routing and dashboard meaning are weakened because tasks do not reliably describe intent.

This creates three product problems:
1. **Inconsistent task quality** — two tasks with the same goal can be authored very differently.
2. **Weak routing signal** — owner/QC recommendations depend too much on ad hoc wording.
3. **Noisy reporting** — dashboards can count tasks, but not reliably explain what kind of work is happening.

The V1 answer is not “better freeform forms.”
The V1 answer is **structured task creation from a small set of operator-visible task types/templates**.

---

## V1 product principle
**A task is an intentioned work item created from a known action template.**

In V1:
- operators should primarily choose **what kind of task they are creating**,
- the system should ask for only the fields needed for that kind of task,
- task status and review behavior should be mostly derived from task type + lifecycle action,
- freeform description should be secondary supporting context, not the primary model.

---

## Canonical V1 task types
V1 should ship with **six** task types. This is enough structure to improve quality without overfitting the system too early.

### 1) Discovery / plan
Use when the next step is to clarify direction before execution.

Examples:
- define scope
- audit current state
- produce recommendation
- write brief / PRD
- propose next-step plan

**Intent:** create clarity, not ship a final end-user asset.

### 2) Design
Use when the task is to shape a user experience, flow, screen set, or visual direction.

Examples:
- wireframes
- UI concepts
- design revision pass
- interaction flow

**Intent:** create a reviewable design output.

### 3) Build / implementation
Use when the task is to implement a concrete product, marketing, or systems change.

Examples:
- frontend feature
- backend integration
- landing page build
- automation workflow setup

**Intent:** produce a shipped or ship-ready implementation output.

### 4) Content / messaging
Use when the task is to create or revise words, campaign assets, or structured content.

Examples:
- website copy
- launch messaging
- email sequence
- content revision

**Intent:** produce a reviewable content deliverable.

### 5) QA / validation
Use when the task is to verify, polish, test, or sign off on existing work.

Examples:
- QA pass
- bug validation
- regression review
- launch-readiness check

**Intent:** validate an output rather than originate one.

### 6) Internal / admin
Use when the task is operational and not intended as an operator-facing deliverable.

Examples:
- housekeeping
- coordination step
- internal setup
- metadata cleanup

**Intent:** support delivery without creating a formal reviewable artifact.

---

## Why these six task types
These types are intentionally based on **work intent**, not department labels.

That matters because:
- a Product owner may create a Discovery / plan task,
- Design may own a Design task,
- Engineering may own a Build task,
- Marketing may own a Content task,
- QA may own a QA / validation task,
- anyone may create Internal / admin tasks.

This gives structure without forcing the task model to mirror the org chart.

---

## Required and optional fields by task type
All V1 tasks share a compact common schema, then add type-specific structured fields.

## A. Common fields for all task types
### Required
- `task_type` — one of the six V1 types
- `task_goal` — short structured summary of what this task is meant to achieve
- `owner_team` — recommended or manually selected responsible lane
- `review_required` — deterministic boolean derived from type defaults, but editable when policy allows

### Optional
- `assignee_agent_id`
- `assignee_user_id`
- `context_note` — short supporting note, not the main source of meaning
- `linked_artifact_refs` — docs, screens, PRDs, URLs, attachments, or existing project links already in project context; these act as references/source-of-truth inputs for the task, not as a promise about the exact working branch or copy that will be used during execution
- `priority` — optional V1.5 candidate; do not make primary in V1 if it complicates the UI

### Existing fields retained for implementation compatibility
- `title`
- `description`
- `status`

### Product guidance for those retained fields
- `title` should be system-generated from task type + task goal, with operator edit allowed only as a light override.
- `description` should store structured context summary + optional operator note, not act as the primary authoring surface.
- `status` remains in the data model, but the UI should present **action-based transitions**, not a raw editable status dropdown.

---

## B. Type-specific fields

### 1) Discovery / plan
### Required fields
- `planning_mode`:
  - `audit_current_state`
  - `define_scope`
  - `write_brief`
  - `recommend_next_steps`
- `target_area`:
  - `product`
  - `design`
  - `engineering`
  - `marketing`
  - `operations`
  - `hybrid`

### Optional fields
- `decision_needed_by`
- `questions_to_answer` (short bullet-style text)
- `existing_asset_ref`

### Default review behavior
- `review_required = true`

### Default status on create
- `todo`

---

### 2) Design
### Required fields
- `design_output_type`:
  - `wireframes`
  - `ui_mockups`
  - `flow_map`
  - `design_revision`
  - `design_system_update`
- `surface`:
  - `web`
  - `mobile`
  - `email`
  - `dashboard`
  - `brand_asset`
  - `other`

### Optional fields
- `reference_artifact_ref`
- `screen_count_estimate`
- `existing_experience_ref`

### Default review behavior
- `review_required = true`

### Default status on create
- `todo`

---

### 3) Build / implementation
### Required fields
- `implementation_kind`:
  - `frontend_feature`
  - `backend_or_api`
  - `integration_or_automation`
  - `website_page`
  - `bug_fix`
  - `system_setup`
- `target_environment`:
  - `web_app`
  - `marketing_site`
  - `internal_ops`
  - `data_system`
  - `mobile_app`
  - `other`

### Optional fields
- `spec_ref`
- `definition_of_done_note`
- `launch_blocker` boolean

### Default review behavior
- `review_required = true`

### Default status on create
- `todo`

---

### 4) Content / messaging
### Required fields
- `content_type`:
  - `website_copy`
  - `email_copy`
  - `ad_or_campaign_asset`
  - `social_copy`
  - `launch_messaging`
  - `content_revision`
- `channel_or_surface`:
  - `site`
  - `email`
  - `ads`
  - `social`
  - `sales`
  - `other`

### Optional fields
- `audience`
- `tone_or_angle`
- `reference_copy_ref`

### Default review behavior
- `review_required = true`

### Default status on create
- `todo`

---

### 5) QA / validation
### Required fields
- `qa_mode`:
  - `qa_pass`
  - `bug_validation`
  - `launch_check`
  - `regression_check`
  - `acceptance_review`
- `subject_ref` — what is being validated

### Optional fields
- `environment`
- `test_focus_areas`
- `blocking_severity_hint`

### Default review behavior
- `review_required = false` by default

Rationale:
- QA tasks often produce findings rather than operator-facing deliverables,
- some QA tasks may still be reviewable if explicitly configured as sign-off work.

### Default status on create
- `todo`

---

### 6) Internal / admin
### Required fields
- `admin_action_type`:
  - `coordination`
  - `setup`
  - `cleanup`
  - `handoff`
  - `tracking_update`

### Optional fields
- `related_work_ref`
- `operator_note`

### Default review behavior
- `review_required = false`

### Default status on create
- `todo`

---

## V1 title generation rules
V1 should generate suggested titles from the chosen template and key fields.

Examples:
- `Define scope for onboarding redesign`
- `Create UI mockups for mobile dashboard`
- `Implement backend integration for CRM sync`
- `Write launch messaging for MVP release`
- `Run QA pass on checkout flow`
- `Coordinate handoff for launch approvals`

### V1 rule
- Let operators lightly edit the generated title.
- Do **not** make title-writing the primary act of task creation.

---

## Create vs edit vs revise behavior
The product needs three distinct task actions because they serve different operator intent.

## 1) Create task
### Operator intent
Create a new unit of work.

### UX model
Operators start with **“What kind of task is this?”** not a blank form.

### Required flow
1. Choose task type
2. Choose structured subtype/options for that type
3. Enter concise task goal
4. Review owner/QC routing preview + review requirement
5. Create task

### What create should allow in V1
- choosing task type/template
- setting goal and required structured fields
- optional support note
- optional assignee override
- optional review_required override only when policy permits

### What create should not emphasize in V1
- long-form descriptions
- arbitrary status selection
- unconstrained metadata editing

### Create defaults
- `status = todo`
- `review_required` derived from task type default
- `title` auto-generated from selections
- routing preview shown before save

---

## 2) Edit task
### Operator intent
Correct or refine task metadata **without changing the task’s core requested outcome**.

### Edit should be for
- refining goal wording
- updating supporting notes
- reassigning owner/assignee
- correcting task type subtype fields
- toggling review requirement when justified
- attaching or replacing references

### Edit should not be for
- asking for a new round of changes after delivery
- redefining the task into substantially different work
- manually forcing lifecycle state in a way that bypasses workflow

### UX rule
Edit should preserve task identity.
If the operator is materially changing the expected output after a delivered state, they should use **Revise**, not generic Edit.

---

## 3) Revise task
### Operator intent
Request a new round of work on an existing task after an initial delivery or completed state.

This must align with the existing feedback/revisions-loop spec.

### Revise should be available when
- task is `done`, and
- task is reviewable or has an existing review loop, and
- operator wants changes rather than a brand-new unrelated task.

### Revise action model
Revise is a **structured action**, not a blank edit form.

The operator should choose one revision reason:
- `fix_or_correct`
- `refine_existing_direction`
- `change_scope_within_same_task`
- `address_feedback`
- `reopen_after_approval`

Then provide:
- required `revision_summary`
- required `what_needs_to_change`
- optional `expected_outcome`

### Revise state effects
Per the feedback loop spec:
- if task was `done` and review is awaiting decision, revision request moves task to `todo`
- when owner resumes work, task moves to `in_progress`
- when resubmitted, task returns to `done`
- review workflow moves through `revision_requested` -> `in_revision` -> `ready_for_rereview`

### Key V1 rule
**Revision requests should not be handled by editing title/description/status directly.**
They should be handled by a dedicated Revise flow that creates structured revision intent.

---

## Status model: raw data vs operator UX
The underlying data model can keep current statuses:
- `todo`
- `in_progress`
- `done`
- `blocked`
- `cancelled`

But V1 operator UX should avoid exposing status as a generic freeform control.

## Recommended V1 action-based transitions
Instead of “Change status,” show context-aware actions:
- `Start work` -> sets `in_progress`
- `Mark blocked` -> sets `blocked`
- `Resume work` -> sets `in_progress`
- `Submit delivery` -> sets `done`
- `Cancel task` -> sets `cancelled`
- `Reopen for revisions` / `Request revisions` -> enters revision flow and transitions per spec

### Why this matters
It makes status understandable as workflow output, not operator guesswork.

---

## Default status and `review_required` behavior

## Default status on creation
All V1 task types should default to:
- `status = todo`

Reason:
- it keeps creation simple,
- it separates “defined” from “actively underway,”
- it works with existing progress rollups,
- it avoids ambiguous initial states.

## Default `review_required` policy by type
| Task type | Default review_required | Why |
| --- | --- | --- |
| Discovery / plan | `true` | output should usually be reviewed/approved |
| Design | `true` | outputs are reviewable deliverables |
| Build / implementation | `true` | delivered work typically needs operator review |
| Content / messaging | `true` | content is operator-reviewable by default |
| QA / validation | `false` | many QA tasks produce findings, not delivery for approval |
| Internal / admin | `false` | internal-only support work should not auto-open review |

## Override policy
V1 should allow a narrow override:
- operators may toggle `review_required` at create/edit time,
- but the default must come from task type,
- and the UI should explain the consequence: `When this task is submitted as done, it will / will not enter review.`

## Hard V1 rule
No inference from task title or description.
`review_required` must be set deterministically by template default or explicit operator action.

---

## Routing implications
Structured task types should improve task routing, not just form quality.

## Owner routing recommendation by task type
| Task type | Default owner recommendation |
| --- | --- |
| Discovery / plan | Product |
| Design | Design |
| Build / implementation | Engineering |
| Content / messaging | Marketing |
| QA / validation | QA |
| Internal / admin | Product or current project owner lane |

## Secondary routing refinements from subtype fields
Examples:
- Discovery / plan + `target_area = marketing` -> Product owner with Marketing pulled in
- Build + `implementation_kind = website_page` -> Engineering or Marketing-web lane depending on repo/team mapping
- Build + `integration_or_automation` -> Engineering / backend-ops lane
- Content + `channel_or_surface = ads` -> Marketing
- QA + `qa_mode = launch_check` -> QA with Product visibility

## QC implications
Task type should also support deterministic QC defaults:
- Product-owned task -> QA or Product-defined reviewer depending on type
- Design-owned task -> Product reviewer
- Engineering-owned task -> QA reviewer
- Marketing-owned task -> Product reviewer
- QA-owned task -> Product reviewer for acceptance-oriented checks, or Engineering when technically scoped

## V1 product requirement
The create flow should show a **routing preview**:
- likely owner lane
- likely QC lane
- short explanation based on selected task type and subtype

This keeps routing explainable and consistent with the broader product direction.

---

## Dashboard and reporting implications
The task model should make dashboards more trustworthy by counting meaningful categories, not just raw task rows.

## V1 dashboard additions
At minimum, dashboards/project views should support:
1. **Tasks by type**
   - Discovery / plan
   - Design
   - Build / implementation
   - Content / messaging
   - QA / validation
   - Internal / admin
2. **Tasks awaiting review**
3. **Tasks in revision**
4. **Blocked tasks**
5. **Done by type**

## Project detail reporting value
On a project page, operators should be able to answer:
- What kind of work is active right now?
- How much is reviewable delivery vs internal coordination?
- Which tasks are waiting on me?
- Which team lanes are carrying the work?

## Required V1 derived reporting fields
Even if implemented as computed UI projections first, V1 reporting needs:
- `task_type`
- `review_required`
- `review_status` where applicable
- owner lane / team
- current lifecycle status

## Why this matters
Without type structure, “5 tasks in progress” is low-trust noise.
With type structure, “2 build tasks in progress, 1 design task awaiting review, 1 QA task blocked” is operationally useful.

---

## Recommended V1 create UX
### Entry point copy
Use `Add task` or `Create task`, but the first screen should immediately ask:
**What kind of task are you adding?**

### Step structure
1. **Task type** — card/select surface
2. **Type-specific options** — constrained choices only for the chosen type
3. **Task goal** — short text field
4. **Review + routing preview** — derived summary with small editable controls where allowed
5. **Create**

### V1 UX rules
- one primary decision per step
- concise progressive disclosure
- supporting free text comes last
- generated title preview shown before save
- no raw status field in create flow

---

## Recommended V1 edit UX
When opening an existing task, the operator should see structured sections:
1. Task type + structured fields
2. Goal / generated title
3. Assignment / routing
4. Review settings
5. History / revision history

### Edit CTA labels
Prefer:
- `Edit task details`
- `Change assignment`
- `Update review settings`

Avoid:
- `Edit everything`
- raw JSON-style field editing

---

## Recommended V1 revise UX
For reviewable completed tasks, show a dedicated action:
- `Request revisions`
- `Reopen work`
- `Ready for re-review`

This should reuse the feedback/revisions model rather than invent a parallel revision system.

## Minimum required revision fields
- revision reason
- what needs to change
- optional expected outcome

## Not in V1
- threaded comments as the primary revision UX
- multiple simultaneous active revision requests on one task
- creating a new sibling task automatically for every revision round
- freeform status tinkering to simulate revisions

---

## Recommended V1 scope
### Must-have in V1
1. Six task types with deterministic defaults
2. Type-specific create flow with constrained fields
3. Generated title pattern instead of blank-title-first UX
4. `review_required` defaulting from task type
5. Action-based status controls instead of raw status editing in primary UX
6. Dedicated Revise flow for delivered tasks
7. Routing preview informed by task type
8. Dashboard/project counts by task type + review state

### Nice-to-have but can wait
- priority framework
- due dates / SLA rules
- dependencies
- nested subtasks
- custom task type builder
- advanced template administration
- rules engine that varies defaults per workspace

### Explicitly out of V1
- fully custom fields per workspace
- arbitrary task taxonomies
- task chat as the main workflow
- ML-inferred task type from freeform description as the source of truth

---

## Data-model recommendation for V1 productization
The current `sprint_items` table is too thin for this UX if used literally. Product-wise, V1 should treat the following as the canonical task model additions:

### Recommended additions
- `task_type`
- `task_template_key` or subtype field(s)
- `task_goal`
- `review_required`
- `owner_team_id` or equivalent routing projection
- `task_metadata jsonb` for type-specific structured fields

### Compatibility stance
- keep `title`, `description`, `status`
- do not keep relying on them as the primary source of task intent
- use structured fields to generate and explain those legacy fields

---

## UX copy guidance
Prefer action-first, plain language labels:
- `What kind of task is this?`
- `What should this task accomplish?`
- `Who should own this first?`
- `Will this need review when submitted?`
- `What needs to change?`

Avoid internal/raw copy like:
- `status`
- `task metadata`
- `freeform notes`
- `edit sprint item`

---

## Acceptance criteria for this V1 model
V1 task UX is successful when:
1. An operator can create a meaningful task without writing a custom title from scratch.
2. Reviewability is deterministic from task type/defaults, not inferred from prose.
3. Revising a completed task uses a dedicated structured action, not ad hoc edits.
4. Routing preview is clearer and more consistent because task intent is structured.
5. Dashboard and project reporting can distinguish reviewable delivery work from internal support work.
6. The system still preserves the product distinction between task and job.

---

## Recommended next product follow-up
After approving this spec, the next slice should be a UI surface plan that maps:
- create task modal/sheet,
- task detail edit surface,
- revision request drawer,
- dashboard count changes,
- minimal schema/API changes needed to support the model.

That follow-up should be implementation-oriented.
This document is the product behavior/spec baseline first.

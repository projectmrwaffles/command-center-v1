# Command Center V1 — Feedback & Revisions UI Surface Plan

## Purpose
Translate the approved V1 feedback/revisions workflow into concrete Command Center UI surfaces, entry points, states, and operator actions.

This plan is intentionally constrained to a structured review loop for delivered tasks. It does **not** introduce chat, comments-as-a-product, or multi-review workflows.

---

## 1) UX principles for V1

1. **Task-first review model**  
   Review lives on the task/work item, because the task is the canonical review unit in the spec.

2. **Structured actions over conversation**  
   Every visible note is attached to a review transition: approve, request revisions, resubmit, reopen, or cancel.

3. **Current state should be obvious in one glance**  
   The operator should not need to inspect raw logs to know whether a delivered task is awaiting review, in revision, ready again, or approved.

4. **Approvals remain separate from delivery review**  
   Feedback UI should sit near task delivery context, while approvals keep their own page, queues, and copy.

5. **History is visible but compact**  
   Timeline/history should show a readable audit trail, but the primary call to action should always sit in a dedicated review card.

---

## 2) V1 hard placement decisions

These are the final IA decisions for V1. They replace any earlier “could be modal / drawer / detail page” ambiguity.

### 2.1 Primary task review container
**Decision:** use the **existing task modal on `/projects/[id]` as the primary review container**.

**Not V1**
- not a new standalone task-detail route
- not a new persistent side drawer as the main task-detail shell
- not inline review controls directly on the task card

**Why this wins in the current IA**
- the current project page already has the task board as the operating surface
- clicking a task already opens the existing task modal/detail interaction
- adding review into that existing modal keeps review contextual and avoids introducing a second competing task-detail pattern
- inline task-card actions would over-compress too much structured state for V1
- a dedicated task-detail page would add navigation overhead the current app does not otherwise use for tasks

**V1 rule**
- Every reviewable-task decision starts from the task card → existing task modal.
- The board card itself only exposes compact review status, never the full review workflow.

### 2.2 Project-detail placement
**Decision:** feedback/revisions appears in **three exact places on `/projects/[id]`**:
1. **Task card secondary review badge** on the board
2. **Task modal review card + review history** inside the existing task modal
3. **Project page ambient visibility** via stats chips and Recent Signals

### 2.3 Dashboard placement
**Decision:** dashboard review visibility lives in the **existing Overview/Needs You area and project cards**, not in a new dedicated feedback page for V1.

**Exact locations**
1. `Needs You` section on `/dashboard` gets review items mixed into the triage model as a first-class item type
2. `Recent Signals` includes review events using the existing signal stream
3. project cards gain review count chips alongside approvals/blocked

### 2.4 Review-history placement
**Decision:** full review history is **task-scoped first**, with compressed project/dashboard echoes.

**Exact rules**
- full review history appears only inside the existing task modal
- project `Recent Signals` shows only compressed one-line review events
- dashboard `Recent Signals` shows only compressed one-line review events
- task cards and project cards never show history, only current-state indicators/counts

---

## 3) Primary V1 surfaces

### A. Project detail → task modal review surface (primary action surface)
This is the main V1 review surface.

**Location**
- On `/projects/[id]`
- Inside the **existing task modal** opened from the task board
- Shown only for tasks where `review_required = true`

**Why here**
- The project page already acts as the working cockpit for tasks.
- The task board already opens a task modal/detail interaction.
- Review should happen where the operator already inspects the delivered work.

### B. Project detail → review history / timeline echoes
This is the audit surface for a task and its surrounding project activity.

**Location**
- In task modal: task-level `Review history` section
- In project detail `Recent Signals`: compressed project-level review events

### C. Dashboard → `Needs You` review triage + project-card counts
This is the cross-project triage surface.

**Location**
- On `/dashboard`
- In the current `Needs You` area
- In the current `Recent Signals` stream
- On project cards as non-zero review chips/counts

### D. Project-level status/count indicators
This is the ambient awareness surface.

**Location**
- Project detail stats chips/row
- Project cards on dashboard
- Task card secondary review badge on the board

---

## 4) Task modal information architecture

When a user opens a reviewable task in the existing task modal, the modal should use this order:

1. **Task header**
   - task title
   - task owner/assignee
   - task status badge
   - review status badge if reviewable

2. **Delivery summary block**
   - latest delivery summary
   - latest submission timestamp
   - supporting links/artifacts already associated with the project/task

3. **Review card** (primary decision block)
   - current review status
   - last operator decision
   - round number when `active_round_number >= 2`
   - primary CTA set based on permissions and state

4. **Review history**
   - append-only list of delivery/review events
   - grouped chronologically, newest first for scanning

5. **Task notes / implementation notes**
   - existing task description or execution context
   - visually distinct from structured review history

### Modal placement rules
- The review card sits **above** review history.
- Review history sits **above** freeform task notes.
- For reviewable tasks, the review card is part of the default modal body, not hidden behind a tab in V1.
- For non-reviewable tasks, the modal keeps its current structure and omits the review card.

---

## 5) Task review card specification

### 5.1 Card title and framing
**Title:** `Delivery review`  
**Supporting copy:** one line that explains state and action needed.

Examples:
- `Awaiting operator decision on the latest delivery.`
- `Revisions were requested. Work has not started yet.`
- `Revisions are in progress.`
- `Updated delivery is ready for re-review.`
- `Delivery approved.`

### 5.2 Always-visible fields
Shown on every reviewable task, even when there is no active request.

- **Review status badge**
- **Review required**: Yes/No
- **Latest delivery summary**
- **Last updated / submitted timestamp**
- **Last decision**: Pending / Changes requested / Approved / Reopened
- **Round**: `Round 2`, `Round 3`, etc. only when round > 1
- **Reopened count** when `reopened_count > 0`

### 5.3 Status badge copy
- `No review yet`
- `Awaiting review`
- `Revision requested`
- `In revision`
- `Ready for re-review`
- `Approved`
- `Canceled` (history only; not a CTA-driven state)

### 5.4 Visual treatment by status
- `Awaiting review` → purple/indigo emphasis
- `Revision requested` → amber or red-leaning blocked emphasis
- `In revision` → blue progress emphasis
- `Ready for re-review` → purple/indigo emphasis again, but with `updated delivery` copy
- `Approved` → green emphasis
- `No review yet` → neutral/zinc

This should align with the app’s existing badge/signal language, not introduce a new semantic color system.

---

## 6) Task review card action model

### 6.1 `awaiting_review`
**Visible to operator**
- Primary button: `Approve delivery`
- Secondary button: `Request revisions`
- Tertiary text action: `Open review history`

**Not shown**
- `Reopen work`
- generic comment box

### 6.2 `ready_for_rereview`
**Visible to operator**
- Primary button: `Approve delivery`
- Secondary button: `Request another revision`
- Supporting label above buttons: `Updated delivery submitted`

### 6.3 `approved`
**Visible to operator**
- Success state replaces the active primary CTA
- Secondary action: `Reopen work`
- Tertiary action: `View review history`

**Card treatment**
- show approval timestamp and approver
- show latest approved delivery summary

### 6.4 `revision_requested`
**Visible to task owner / assigned agent**
- Primary button: `Start revisions`
- Secondary button: `View revision request`

**Visible to operator**
- no decision buttons
- read-only structured summary of requested changes

### 6.5 `in_revision`
**Visible to task owner / assigned agent**
- Primary button: `Ready for re-review`
- Secondary button: `Add resubmission note`

**Visible to operator**
- read-only status and latest revision request

### 6.6 No active request on eligible done task
If task is `done`, `review_required = true`, and no active request exists:
- show neutral review card
- button: `Open review`
- supporting copy: `No active delivery review exists for this completed task.`

This is the manual recovery path defined in spec.

---

## 7) Exact modal / drawer behavior by action

V1 uses the existing **task modal** as the parent container and then uses a **single secondary overlay pattern per action**. The task modal itself remains open in the background until the action completes or cancels.

### 7.1 `Request revisions`
**Parent context**
- launched from the review card inside the existing task modal

**Desktop container**
- **right-side drawer over the task modal**

**Mobile container**
- **full-screen sheet** from the bottom or full-height modal; no nested side drawer pattern

**Why drawer here**
- this is the heaviest form in the review loop
- it benefits from keeping task context visible behind it on desktop
- it avoids overloading the base task modal body with a long structured form

**Title**
- `Request revisions`

**Fields**
1. `Summary` — short label for this revision request
2. `What needs to change` — required multiline field
3. `Reason / expected outcome` — optional multiline field
4. `Severity` — segmented control or select: Low / Medium / High
5. `Blocking` — yes/no toggle
6. `Target area tags` — optional multi-select chips: Copy, UX, Frontend, Backend, QA

**Footer actions**
- Primary: `Send revision request`
- Secondary: `Cancel`

**Inline consequence preview**
- `Task will move from Done to Todo.`
- `Review status will change to Revision requested.`

**On submit success**
- close the drawer/sheet
- return focus to the task modal
- task modal updates in-place to `Revision requested`
- top of review history shows the new event

### 7.2 `Approve delivery`
**Parent context**
- launched from the review card inside the existing task modal

**Container**
- **center confirmation modal** on desktop
- **bottom sheet confirmation** on mobile

**Why not drawer**
- approval is short, low-input, and should feel lightweight

**Title**
- `Approve delivery?`

**Fields**
- optional note textarea: `Approval note (optional)`

**Footer actions**
- Primary: `Approve delivery`
- Secondary: `Cancel`

**Consequence note**
- `Task stays Done. Review will be marked approved.`

**On submit success**
- close confirmation modal/sheet
- return focus to the task modal
- review card switches to approved success state
- history appends `Delivery approved`

### 7.3 `Reopen work`
**Parent context**
- launched from approved state inside the existing task modal

**Container**
- **center confirmation modal** on desktop
- **bottom sheet or full-screen confirmation** on mobile depending on available height

**Title**
- `Reopen approved work`

**Fields**
1. `Reason` — required multiline field

**Footer actions**
- Primary: `Reopen work`
- Secondary: `Cancel`

**Consequence note**
- `Task will move from Done to Todo.`
- `Previous approval stays in history.`

**On submit success**
- close confirmation surface
- return focus to task modal
- card changes to `Revision requested`
- add persistent helper text: `Previously approved`
- history appends `Work reopened`

### 7.4 `Start revisions`
**Parent context**
- launched by owner/agent from task modal review card

**Container**
- **inline confirmation inside the review card** on desktop and mobile
- no separate modal/drawer in V1

**Text**
- `Move this task into active revision work?`

**Action**
- Primary: `Start revisions`
- Secondary text action: `Cancel`

**Effect**
- task `todo` → `in_progress`
- review status `revision_requested` → `in_revision`

**Why inline**
- it is a simple state acknowledgment, not a data-entry flow

### 7.5 `Ready for re-review`
**Parent context**
- launched by owner/agent from task modal review card

**Desktop container**
- **right-side drawer over the task modal**

**Mobile container**
- **full-screen sheet**

**Title**
- `Submit updated delivery`

**Fields**
1. `Updated delivery summary` — required
2. `Resubmission note` — optional

**Footer actions**
- Primary: `Submit for re-review`
- Secondary: `Cancel`

**Consequence note**
- `Task will move to Done.`
- `Review status will change to Ready for re-review.`

**On submit success**
- close drawer/sheet
- return focus to task modal
- review card changes to `Ready for re-review`
- history appends `Delivery resubmitted`

### 7.6 Overlay stacking and close behavior
To keep nested flows predictable:
- only **one secondary overlay** may be open on top of the task modal at a time
- closing a secondary overlay never closes the task modal beneath it
- successful submit returns focus to the triggering control inside the refreshed task modal
- ESC/backdrop closes only the topmost overlay
- if the user has unsaved input in a drawer/sheet, show a dirty-state confirm before dismissing

---

## 8) Review history design and exact placement rules

### 8.1 Task-level history block
**Section title:** `Review history`

Each entry row should show:
- event label
- timestamp
- actor name + actor role
- round number when applicable
- body text / structured note summary
- compact metadata chips where relevant

**Entry labels**
- `Delivery submitted`
- `Revision requested`
- `Revision started`
- `Delivery resubmitted`
- `Delivery approved`
- `Work reopened`
- `Review canceled`

### 8.2 Entry body patterns
- `Revision requested` shows the structured request fields in readable blocks:
  - What needs to change
  - Reason / expected outcome
  - Severity
  - Blocking
  - Target areas
- `Delivery resubmitted` shows:
  - updated delivery summary
  - resubmission note if provided
- `Delivery approved` shows approval note only if present
- `Work reopened` shows required reopen reason

### 8.3 Exact history placement rules
**Task modal**
- show full history by default for reviewable tasks
- newest event first
- do not paginate in V1 unless event count becomes a performance problem

**Project page `Recent Signals`**
- show only the latest review event summaries mixed with other signals
- limit each entry to a one-line summary plus timestamp
- never duplicate the full structured revision body here

**Dashboard `Recent Signals`**
- same compression rules as project signals
- no full review-body content

**Board cards / project cards / stats chips**
- never show history
- show only current-state indicators/counts

### 8.4 Timeline compression rule
On task detail, show full entries.  
On project-level and dashboard surfaces, compress to one-line summaries.

Examples:
- `Revision requested on Landing page polish • Round 2`
- `Updated delivery submitted for Onboarding checklist`
- `Delivery approved for Dashboard empty states`
- `Approved work reopened for Mobile nav refactor`

---

## 9) Project detail page changes

The existing `/projects/[id]` page already has:
- summary stats chips/row
- task board
- recent signals
- existing task modal

V1 extends those exact areas.

### 9.1 Task cards on the board
Each task card gains a small secondary review label when `review_required = true`.

**Examples**
- `Awaiting review`
- `Revision requested`
- `In revision`
- `Ready for re-review`
- `Approved`

**Placement rule**
- place the review badge **inside the task card metadata area, below or beside the existing task status badge**
- it must be visually secondary to the canonical task status
- no review action buttons appear directly on the board card in V1

### 9.2 Existing task modal becomes the review home
This is the canonical V1 review surface.

**Recommended layout inside the current task modal**
- top: task title + task status + owner
- upper body: delivery summary
- middle: review card
- lower body: review history
- bottom: existing task notes/description/actions

### 9.3 Stats row additions
Current project stats show tasks, in progress, done, blocked, approvals.

For V1, add review visibility as **separate chips in the same stats row or in an immediately adjacent second chip row**.

**Counts**
- `Needs review` = `awaiting_review + ready_for_rereview`
- `In revision` = `revision_requested + in_revision`

**Rule**
- do **not** merge approvals and review counts
- if horizontal space is tight, stats may wrap to two rows of chips before they are collapsed into hidden UI

### 9.4 Recent Signals card
Continue using the existing signal card, but include review events using existing signal kinds:
- `delivery_submitted` → `completed`
- `revision_requested` → `blocked`
- `revision_started` → `progress`
- `delivery_resubmitted` → `completed`
- `delivery_approved` → `completed`
- `delivery_reopened` → `blocked`
- `feedback_request_canceled` → `activity`

Signal detail copy should include whether action is needed.

Examples:
- `Updated delivery is waiting for review.`
- `Revisions requested. Work is back in the queue.`
- `Approved work was reopened and needs changes.`

---

## 10) Dashboard UX plan

### 10.1 `Needs You` section
The dashboard currently has a `Needs You` section. V1 keeps that container and extends it.

**Decision:** do **not** create a separate dashboard widget named `Needs your review` as a standalone block.  
Instead, review items become a new first-class item type **inside the existing `Needs You` list**.

**Item types in V1**
1. `Needs review`
   - items in `awaiting_review`
   - items in `ready_for_rereview`
2. `Approvals`
   - existing pending approvals
3. `Blocked`
   - existing blocked jobs/tasks

**Ordering rule**
- order all `Needs You` items by most recent actionable timestamp descending
- do not hard-pin reviews above approvals at all times
- keep the type label explicit so an operator can distinguish `review` from `approval`

Each review queue item should show:
- task title
- project name
- status label: `Awaiting review` or `Ready for re-review`
- timestamp of latest submission
- optional round badge if round > 1
- click target → open the parent project and automatically open that task in the task modal

**Empty state**
- `No tasks are waiting for review.` when there are no review items
- if the broader list still contains approvals/blocked items, those still display normally

### 10.2 Project cards
Project cards already show active flags. Add review counts without collapsing them into approvals.

**Recommended chip set**
- `X approvals`
- `Y blocked`
- `Z needs review`
- `N in revision`

Only show non-zero chips.

**Placement rule**
- review chips live in the same chip group as approvals/blocked on the card footer
- project card body should not attempt to show review history or per-task breakdowns in V1

### 10.3 Dashboard `Recent Signals`
Inject review events into the existing recent signal stream rather than creating a parallel feedback feed.

Kind mapping follows the spec so review items naturally sort with other operator activity.

---

## 11) Mobile behavior and constraints

### 11.1 Primary mobile container decision
**Decision:** mobile still uses the **existing task modal pattern**, but it behaves as a **full-screen task sheet/modal** rather than a centered desktop-style dialog.

This keeps one canonical task-detail pattern across breakpoints.

### 11.2 Mobile action containers
- `Request revisions` → full-screen sheet
- `Ready for re-review` → full-screen sheet
- `Approve delivery` → bottom confirmation sheet
- `Reopen work` → bottom confirmation sheet or full-screen confirm if textarea height requires it
- `Start revisions` → inline confirm inside the task sheet

### 11.3 Sticky action behavior
For operator-actionable states on mobile, use a sticky footer in the task sheet:
- `Approve delivery`
- `Request revisions`

For owner-actionable states on mobile, use a sticky footer for:
- `Start revisions`
- `Ready for re-review`

Only show the actions relevant to the current user role/state.

### 11.4 Mobile content rules
- review card content appears before history in the scroll order
- long history remains scrollable in the same screen; do not create nested scroll regions inside history if avoidable
- long structured forms use full-screen sheets to preserve room for textarea fields and footer actions
- stats chips may wrap to multiple rows
- task-card review badges should stay single-line where possible; if space is too tight, use shortened copy before truncating core task title

### 11.5 Mobile constraints and non-goals
- no side-by-side split panes
- no nested drawers
- no persistent right rail
- no inline task-card review actions beyond opening the task sheet
- no attempt to show full revision request bodies on dashboard cards or project cards

---

## 12) Empty states and edge states

### 12.1 Reviewable task with no request yet
**Condition**
- task done
- review_required true
- no active request

**UI**
- neutral review card
- text: `No active delivery review exists yet.`
- action: `Open review`

### 12.2 Non-reviewable task
**Condition**
- review_required false

**UI**
- no review card by default
- optional subtle helper text in task detail: `This task does not require operator review.`

V1 preference: hide the review card entirely to reduce noise.

### 12.3 Awaiting review with missing delivery summary
This should be treated as incomplete delivery context.

**UI**
- warning banner inside review card: `Delivery summary missing`
- operator can still review if necessary, but UI should signal poor submission quality

### 12.4 Revision requested, work not yet started
**UI**
- status badge: `Revision requested`
- helper text: `Changes were requested. Work has not resumed yet.`
- owner sees `Start revisions`

### 12.5 In revision but task blocked
Per spec, task-level blocked state should be visible without mutating feedback history.

**UI**
- keep review card status as `In revision` or `Revision requested` depending on prior state
- add stacked blocked badge / banner: `Blocked while revisions are active`
- show blocker context in the task header or supporting system note

### 12.6 Approved, then reopened
**UI**
- current status badge: `Revision requested`
- secondary badge or inline chip: `Previously approved`
- history explicitly shows both approval and reopen events
- helper text: `Approval remains in history. Current state is reopened for changes.`

### 12.7 Multiple revision rounds
**UI**
- surface `Round 2`, `Round 3`, etc. in review card header and history entries
- do not create nested thread UI
- latest open round stays prominent; earlier rounds remain in history

### 12.8 Task canceled mid-review
**UI**
- disable action buttons
- show muted banner: `Review closed because the task was canceled.`
- keep review history visible read-only

### 12.9 No review items on dashboard
**UI**
- when review count is zero, show no review-specific empty card unless the `Needs You` list itself needs empty-state copy
- reinforce that approvals may still exist separately

---

## 13) Copy model

Use explicit review language throughout.

**Preferred labels**
- `Delivery review`
- `Approve delivery`
- `Request revisions`
- `Ready for re-review`
- `Reopen work`
- `Review history`
- `Revision request`
- `Resubmission note`
- `Reopen reason`

**Avoid**
- `Comment`
- `Reply`
- `Message`
- `Conversation`
- `Thread` as the main object name
- `Chat`

**Approvals separation copy**
Where review and approvals are nearby, add helper text like:
- `Approvals handle permission to proceed. Delivery review handles acceptance of the work.`

---

## 14) Recommended V1 interaction details

### Permission-aware rendering
- Operators see decision actions
- Owners/agents see work-resume and resubmission actions
- Viewers see read-only history and status

### No inline freeform composer
There should never be an always-open textarea that implies ongoing discussion.  
Every text input should be opened by a deliberate state transition action.

### Routing target behavior from dashboard
When a dashboard review item is clicked:
- navigate to `/projects/[id]`
- restore/open the matching task in the existing task modal
- scroll the underlying board only as needed to preserve context if the modal is dismissed

This avoids inventing a dashboard-side task-detail surface.

---

## 15) Recommended V1 implementation order for UX surfaces

1. Extend the existing task modal with the review card
2. Add `Request revisions` drawer/sheet
3. Add `Approve delivery` confirmation flow
4. Add `Reopen work` confirmation flow
5. Add `Ready for re-review` drawer/sheet
6. Add task-level review history in the task modal
7. Add board review badges + project stats chips + Recent Signals mapping
8. Add dashboard review items + project-card review chips

This order delivers immediate operator value before expanding cross-project visibility.

---

## 16) Final V1 surface summary

### Must appear in V1
- **Existing task modal as the canonical review surface** on reviewable tasks
- **Request revisions drawer/sheet** with structured fields
- **Approve delivery confirmation modal/sheet**
- **Reopen work confirmation modal/sheet** with required reason
- **Ready for re-review drawer/sheet** with required delivery summary
- **Task-level review history** inside the task modal
- **Project task-card review badges**
- **Project stats chips** for `Needs review` and `In revision`
- **Project Recent Signals** entries for review events
- **Dashboard `Needs You` review items**
- **Dashboard/project-card review chips** for ambient counts

### Should not appear in V1
- open-ended comment thread
- generic chat composer
- multi-reviewer controls
- annotation UI
- dedicated standalone `/feedback` area
- dedicated standalone task detail route for review
- inline task-card review workflow controls

---

## 17) Route/component mapping recommendation

This is a planning recommendation, not an implementation spec.

- `/projects/[id]`
  - extend the **existing task modal** with:
    - `DeliveryReviewCard`
    - `ReviewHistoryList`
    - action drawers/modals for approve / request revisions / reopen / resubmit
  - extend project page stats with review chips
  - extend task cards with secondary review badges
  - extend `Recent Signals` with review events

- `/dashboard`
  - extend existing `Needs You` list with review item type(s)
  - extend `Recent Signals` with review events
  - extend project cards with review count chips

- `/approvals`
  - no functional merge
  - optionally add one helper sentence clarifying separation from delivery review

This keeps approvals and feedback distinct while using the existing project task modal as the canonical task-review cockpit.

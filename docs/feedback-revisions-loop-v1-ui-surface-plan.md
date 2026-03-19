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

## 2) Primary V1 surfaces

### A. Project detail → task review card (primary action surface)
This is the main V1 review surface.

**Location**
- On `/projects/[id]`
- Inside the task detail experience opened from the Task Board
- Shown only for tasks where `review_required = true`

**Why here**
- The project page already acts as the working cockpit for tasks.
- The task board already opens a task modal/detail interaction.
- Review should happen where the operator already inspects the delivered work.

### B. Project detail → review history / timeline entries
This is the main audit surface for a task and its surrounding project activity.

**Location**
- In task detail: task-level “Review history” section
- In project detail right rail / Recent Signals: compressed project-level signals for review events

### C. Dashboard → “Needs your review” and “In revision” queues
This is the main cross-project triage surface.

**Location**
- On `/dashboard`
- In the current “needs you” area and project cards/counts
- Reuses existing signal taxonomy and count patterns

### D. Project-level status/count indicators
This is the ambient awareness surface.

**Location**
- Project detail summary stats row
- Project cards on dashboard
- Optional badges on task cards in board columns

---

## 3) Task detail information architecture

When a user opens a reviewable task, the task detail should have this order:

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

V1 emphasis: the review card sits **above** review history so the current action is clearer than the audit trail.

---

## 4) Task review card specification

## 4.1 Card title and framing
**Title:** `Delivery review`  
**Supporting copy:** one line that explains state and action needed.

Examples:
- `Awaiting operator decision on the latest delivery.`
- `Revisions were requested. Work has not started yet.`
- `Revisions are in progress.`
- `Updated delivery is ready for re-review.`
- `Delivery approved.`

## 4.2 Always-visible fields
Shown on every reviewable task, even when there is no active request.

- **Review status badge**
- **Review required**: Yes/No
- **Latest delivery summary**
- **Last updated / submitted timestamp**
- **Last decision**: Pending / Changes requested / Approved / Reopened
- **Round**: `Round 2`, `Round 3`, etc. only when round > 1
- **Reopened count** when `reopened_count > 0`

## 4.3 Status badge copy
- `No review yet`
- `Awaiting review`
- `Revision requested`
- `In revision`
- `Ready for re-review`
- `Approved`
- `Canceled` (history only; not a CTA-driven state)

## 4.4 Visual treatment by status
- `Awaiting review` → purple/indigo emphasis
- `Revision requested` → amber or red-leaning blocked emphasis
- `In revision` → blue progress emphasis
- `Ready for re-review` → purple/indigo emphasis again, but with “updated delivery” copy
- `Approved` → green emphasis
- `No review yet` → neutral/zinc

This should visually align with the app’s existing badge/signal language, not introduce a new semantic color system.

---

## 5) Task review card action model

## 5.1 Awaiting review
**Visible to operator**
- Primary button: `Approve delivery`
- Secondary button: `Request revisions`
- Overflow / tertiary text action: `Open review history`

**Not shown**
- `Reopen work` (only after approval)
- generic comment box

## 5.2 Ready for re-review
**Visible to operator**
- Primary button: `Approve delivery`
- Secondary button: `Request another revision`
- Supporting label above buttons: `Updated delivery submitted`

## 5.3 Approved
**Visible to operator**
- Primary button style should be de-emphasized or replaced with success state
- Secondary action: `Reopen work`
- Optional tertiary: `View review history`

**Card treatment**
- show approval timestamp and approver
- show latest approved delivery summary

## 5.4 Revision requested
**Visible to task owner / assigned agent**
- Primary button: `Start revisions`
- Secondary button: `View revision request`

**Visible to operator**
- No approval buttons
- read-only structured summary of requested changes

## 5.5 In revision
**Visible to task owner / assigned agent**
- Primary button: `Ready for re-review`
- Secondary button: `Add resubmission note`

**Visible to operator**
- read-only status and latest revision request

## 5.6 No active request on eligible done task
If task is `done`, `review_required = true`, and no active request exists:
- show neutral review card
- button: `Open review`
- supporting copy: `No active delivery review exists for this completed task.`

This is the manual recovery path defined in spec.

---

## 6) Modal / drawer flows

V1 should use focused modal or drawer flows tied to one explicit action. No full-page workflow required.

### 6.1 Request revisions flow
**Trigger**
- from task review card in `awaiting_review` or `ready_for_rereview`

**Container**
- right-side drawer on desktop
- full-screen sheet/modal on mobile

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
Small system note in footer/body:
- `Task will move from Done to Todo.`
- `Review status will change to Revision requested.`

**Validation**
- `What needs to change` is required
- disable submit until valid

### 6.2 Approve delivery flow
**Trigger**
- from `awaiting_review` or `ready_for_rereview`

**Container**
- lightweight confirmation modal, or inline popover if design wants fewer clicks

**Title**
- `Approve delivery?`

**Fields**
- optional note textarea: `Approval note (optional)`

**Footer actions**
- Primary: `Approve delivery`
- Secondary: `Cancel`

**Consequence note**
- `Task stays Done. Review will be marked approved.`

### 6.3 Reopen work flow
**Trigger**
- from approved state only

**Container**
- confirmation modal or drawer

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

### 6.4 Start revisions flow
This can be intentionally lightweight.

**Trigger**
- owner/agent presses `Start revisions`

**Container**
- no heavy modal required; inline confirmation is enough

**Text**
- `Move this task into active revision work?`

**Action**
- Primary: `Start revisions`

**Effect**
- task `todo` → `in_progress`
- review status `revision_requested` → `in_revision`

### 6.5 Ready for re-review flow
**Trigger**
- owner/agent presses `Ready for re-review`

**Container**
- drawer/modal

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

---

## 7) Review history design

## 7.1 Task-level history block
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

## 7.2 Entry body patterns
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

## 7.3 Timeline compression rule
On task detail, show full entries.
On project-level surfaces, compress to one-line summaries.

Examples:
- `Revision requested on Landing page polish • Round 2`
- `Updated delivery submitted for Onboarding checklist`
- `Delivery approved for Dashboard empty states`
- `Approved work reopened for Mobile nav refactor`

---

## 8) Project detail page changes

The existing `/projects/[id]` page already has:
- summary stats
- task board
- recent signals

V1 should extend, not replace, those areas.

### 8.1 Task cards on the board
Each task card should gain a small secondary review label when `review_required = true`.

**Examples**
- `Awaiting review`
- `Revision requested`
- `In revision`
- `Ready for re-review`
- `Approved`

This label should be smaller than the task status badge and treated as delivery-review context, not the task’s canonical status.

### 8.2 Task detail modal / panel
This becomes the primary home of the review card and review history.

Recommended layout inside the task detail modal:
- top: task title + task status + owner
- middle: delivery summary + review card
- bottom: review history, then task notes

### 8.3 Stats row additions
Current stats show tasks, in progress, done, blocked, approvals.

For V1, revise or expand to include review visibility:
- `Needs review` count = awaiting_review + ready_for_rereview
- `In revision` count = revision_requested + in_revision

Recommended approach for V1:
- keep `Approvals` visible
- replace one less-critical duplicate task metric or add a second line/mini-chip row under stats
- do **not** merge approvals and review counts

### 8.4 Recent Signals card
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

## 9) Dashboard UX plan

## 9.1 Needs-you panel
The dashboard currently centers approvals and blocked items. V1 should broaden this into a true operator triage lane.

**Panel title:** `Needs your attention`

**Queue groups inside panel**
1. `Needs review`
   - items in `awaiting_review`
   - items in `ready_for_rereview`
2. `Approvals`
   - existing pending approvals
3. `Blocked`
   - existing blocked jobs/tasks

Review items should appear **above approvals** only when they are the newest and actionable, but approval and review labels must remain distinct.

Each review queue item should show:
- task title
- project name
- status label: `Awaiting review` or `Ready for re-review`
- timestamp of latest submission
- optional round badge if round > 1
- click target → open project/task detail

Empty state:
- `No tasks are waiting for review.`

## 9.2 Project cards
Project cards currently show active flags. Add review counts without collapsing them into approvals.

Recommended chip set:
- `X approvals`
- `Y blocked`
- `Z needs review`
- `N in revision`

Only show non-zero chips.

## 9.3 Recent signal rail
Inject review events into the existing recent signal stream rather than creating a parallel feedback feed.

Kind mapping should follow spec, so review items naturally sort with other product activity.

---

## 10) Empty states and edge states

## 10.1 Reviewable task with no request yet
**Condition**
- task done
- review_required true
- no active request

**UI**
- neutral review card
- text: `No active delivery review exists yet.`
- action: `Open review`

## 10.2 Non-reviewable task
**Condition**
- review_required false

**UI**
- no review card by default
- optional subtle helper text in task detail: `This task does not require operator review.`

V1 preference: hide the review card entirely to reduce noise.

## 10.3 Awaiting review with missing delivery summary
This should be treated as incomplete delivery context.

**UI**
- warning banner inside review card: `Delivery summary missing`
- operator can still review if necessary, but UI should signal poor submission quality

## 10.4 Revision requested, work not yet started
**UI**
- status badge: `Revision requested`
- helper text: `Changes were requested. Work has not resumed yet.`
- owner sees `Start revisions`

## 10.5 In revision but task blocked
Per spec, task-level blocked state should be visible without mutating feedback history.

**UI**
- keep review card status as `In revision` or `Revision requested` depending on prior state
- add stacked blocked badge / banner: `Blocked while revisions are active`
- show blocker context in the task header or supporting system note

## 10.6 Approved, then reopened
**UI**
- current status badge: `Revision requested`
- secondary badge or inline chip: `Previously approved`
- history explicitly shows both approval and reopen events
- helper text: `Approval remains in history. Current state is reopened for changes.`

## 10.7 Multiple revision rounds
**UI**
- surface `Round 2`, `Round 3`, etc. in review card header and history entries
- do not create nested thread UI
- latest open round stays prominent; earlier rounds remain in history

## 10.8 Task canceled mid-review
**UI**
- disable action buttons
- show muted banner: `Review closed because the task was canceled.`
- keep review history visible read-only

## 10.9 No review items on dashboard
**UI**
- empty state in queue: `Nothing is waiting for review right now.`
- reinforce that approvals may still exist separately

---

## 11) Copy model

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

## 12) Recommended V1 interaction details

### Sticky action bar on mobile
For task detail review actions, use a sticky footer on mobile when the operator can act:
- `Approve delivery`
- `Request revisions`

This mirrors the existing approvals page pattern and keeps actionability high.

### Permission-aware rendering
- Operators see decision actions
- Owners/agents see work-resume and resubmission actions
- Viewers see read-only history and status

### No inline freeform composer
There should never be an always-open textarea that implies ongoing discussion.
Every text input should be opened by a deliberate state transition action.

---

## 13) Recommended V1 implementation order for UX surfaces

1. Add review card to task detail
2. Add request revisions drawer
3. Add approve / reopen confirmation flows
4. Add resubmission flow for owners/agents
5. Add task-level review history
6. Add project-level signal support and counts
7. Add dashboard review queues and project-card chips

This order gives immediate operator value before expanding cross-project visibility.

---

## 14) Final V1 surface summary

### Must appear in V1
- **Task detail review card** on reviewable tasks
- **Request revisions drawer** with structured fields
- **Approve delivery** confirmation flow
- **Reopen work** confirmation flow with required reason
- **Ready for re-review** resubmission flow with required delivery summary
- **Task-level review history**
- **Project recent signals** entries for review events
- **Dashboard queue** for `Needs review`
- **Dashboard/project indicators** for `In revision`

### Should not appear in V1
- open-ended comment thread
- generic chat composer
- multi-reviewer controls
- annotation UI
- separate standalone feedback product area unless needed later

---

## 15) Route/component mapping recommendation

This is a planning recommendation, not an implementation spec.

- `/projects/[id]`
  - extend task detail interaction with:
    - `DeliveryReviewCard`
    - `ReviewHistoryList`
    - action drawers/modals for approve / request revisions / reopen / resubmit
- `/dashboard`
  - extend needs-you lane with review queue groups
  - extend project cards with review count chips
- `/approvals`
  - no functional merge
  - optionally add one helper sentence clarifying separation from delivery review

This keeps approvals and feedback distinct while using the project page as the canonical task-review cockpit.

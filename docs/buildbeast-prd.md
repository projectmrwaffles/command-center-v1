# BuildBeast PRD

**Version:** v1.0  
**Status:** Implementation-ready for Milestone 1  
**Product owner:** Compass (Product)  
**Architecture owner:** Oracle (Tech Lead)  
**Repo:** `command-center`  
**Date:** 2026-03-14

---

## 1. Document purpose

This PRD defines the **implementation-ready Milestone 1** for BuildBeast, the productized future of Command Center.

BuildBeast is the **control plane for agent-assisted delivery**: one system to intake work, route it to the right lane, coordinate execution, request approvals, surface meaningful signals, and preserve an audit trail.

This version explicitly addresses prior QC gaps:
- rigorous domain definitions
- a real Milestone 1 scope table
- concrete routing rules
- concrete approval spec
- concrete signal spec
- concrete document/artifact spec
- core user flows
- measurable acceptance criteria
- a separate concise 1-page executive brief

---

## 2. Product thesis

Teams do not just need AI that can do work. They need a trustworthy operating layer between **messy requests** and **shipped outcomes**.

Today that layer is fragmented across chat, PM tools, logs, docs, and human memory. BuildBeast turns that fragmented workflow into a product:

> **Messy request → structured intake → explainable routing → supervised execution → approvals → readable signals → auditable outcome**

### Product promise

> Give operators one place to intake, route, orchestrate, supervise, and audit agent-assisted work until it ships.

### Milestone 1 objective

Use Command Center V1 as the proving ground for the core BuildBeast abstractions and make them credible enough that the team can build against this document without re-litigating the model every sprint.

---

## 3. Problem statement

Current pain points:

1. **Requests arrive vague**
   - Users describe goals in chat, not structured fields.
   - Important routing metadata is missing.

2. **Routing is inconsistent**
   - Ownership depends on who saw the request first.
   - Hybrid requests are especially messy.

3. **State is fragmented**
   - Projects, tasks, jobs, approvals, docs, events, and usage live in different places.
   - Operators waste time reconstructing status.

4. **Approvals are under-specified**
   - Decisions arrive without enough context.
   - There is weak separation between execution and review.

5. **Signals are noisy**
   - Raw event feeds are not good operational summaries.
   - Stakeholders cannot quickly answer “what changed that matters?”

6. **Documents are weakly integrated into execution**
   - PRDs and uploaded docs exist, but are not clearly defined as part of the operating model.

---

## 4. Product goals and non-goals

### Goals

1. Make project creation fast and structured.
2. Recommend owner and QC lanes immediately and explain why.
3. Give every project a single trustworthy workspace.
4. Distinguish durable work items from execution attempts.
5. Make approvals explicit, contextual, and auditable.
6. Convert raw events into readable, high-signal updates.
7. Tie documents and usage back to projects.

### Non-goals for Milestone 1

1. Multi-tenant SaaS
2. Generic workflow builder
3. Full enterprise permissions model
4. Runtime-agnostic adapters beyond OpenClaw
5. Billing and self-serve onboarding
6. Replacing Linear/Jira/Asana for every workflow

---

## 5. Target users

### Primary user now
**Operator / chief of staff / delivery lead** running cross-functional, agent-assisted work.

Needs:
- fast triage
- owner/QC recommendation
- intervention queue
- readable progress
- confidence in the audit trail

### Secondary users
- **Requester**: submits or sponsors work
- **Owner lane**: primary accountable delivery team
- **QC approver**: separate reviewer / gatekeeper
- **Contributor**: human or agent doing scoped work
- **Stakeholder**: wants visibility without operational detail

### Best future ICPs
1. AI-native agencies / studios
2. Founder-led product teams
3. Internal ops / innovation teams

---

## 6. Locked domain definitions

These definitions are mandatory for Milestone 1.

### 6.1 Project
The **durable business container** for a desired outcome.

A project answers:
- what is the work?
- who owns it?
- what stage is it in?
- what is blocked?
- what changed recently?

**Current repo support:** `projects` table with `name`, `type`, `team_id`, `description`, `status`, `progress_pct`, `intake`, `intake_summary`.

### 6.2 Intake
The **structured request payload** stored on the project and used for routing.

Current schema/design:
- `projects.intake jsonb`
- `projects.intake_summary text`

Canonical fields for M1:
- `shape: string`
- `context: string[]`
- `capabilities: string[]`
- `stage: string`
- `confidence: string`
- `projectName?: string`
- `summary?: string`
- `goals?: string`

### 6.3 Team / lane
A **functional ownership queue** such as Product, Design, Engineering, Marketing, QA.

Current repo support:
- `teams`
- `team_members`
- `projects.team_id`
- `agents.primary_team_id`

### 6.4 Task
A **durable scoped work item** within a project.

Current repo implementation uses `sprint_items`.
In product language, Milestone 1 should treat `sprint_items` as **tasks/work items**, even if the table name remains unchanged.

### 6.5 Job / run
A **discrete execution attempt** or assignment.

Current repo support:
- `jobs.project_id`
- `jobs.owner_agent_id`
- `jobs.prd_id`
- status + summary

Rule: **A job is not the same thing as a task.**
- Task = durable scope
- Job/run = execution against scope

### 6.6 Approval
A **first-class decision object** requiring human review.

Current repo support:
- `approvals`
- `approval_requests` view
- fields include `project_id`, `job_id`, `agent_id`, `requester_name`, `severity`, `status`, `summary`, `decided_by`, `decided_at`

### 6.7 Event
A **durable record of a meaningful change**.

Current repo support:
- `agent_events`
- `event_type`, `payload`, `project_id`, `job_id`, `agent_id`, `timestamp`

### 6.8 Signal
A **human-readable projection** derived from events and state changes.

Signals are not raw telemetry. They are curated updates that answer:
- what changed?
- why does it matter?
- what needs action?

### 6.9 Document / artifact
A **file or link attached to project context**.

Current repo support:
- `project_documents` for uploaded files/links
- `prds` for structured PRD records
- `artifacts` legacy support

### 6.10 PRD
A **structured planning document** attached to a project.

Current repo support:
- `prds.project_id`
- `title`, `content_md`/`body_markdown`, `version`, `status`, `storage_path`/`pdf_url`

---

## 7. Product principles

1. **Human override is first-class.**
2. **Routing is product value, not setup glue.**
3. **Project, task, and job must remain distinct.**
4. **Approvals are first-class objects, not status flags.**
5. **Signals should increase trust, not noise.**
6. **Documents belong inside the operating model, not beside it.**
7. **Realtime is a projection; durable state is the truth.**
8. **Internal Vertillo personas are presets, not the long-term product model.**

---

## 8. Milestone 1 scope table

This is the authoritative M1 scope.

| Area | In scope for M1 | Explicitly out of scope for M1 | Notes |
|---|---|---|---|
| Guided intake | Selection-first flow, structured payload, intake summary, optional notes/docs | Natural-language-only freeform intake as primary path | Already partly implemented in repo |
| Routing | Owner lane + QC lane recommendation, explainable logic, manual override path in model | ML-based routing, user-configurable playbooks | Use deterministic rules now |
| Project creation | Create project, assign primary team, create starter tasks, attach docs | Workspace templates, complex setup wizards | Must feel <2 min |
| Project workspace | Overview, task board, recent signals, docs, teams, progress, approvals count | Deep analytics, customizable layouts | Current page exists and needs model clarity |
| Tasks | Create/update task, assign to agent, status progression, blocked state | Dependencies, due dates, SLA engine | Implement via `sprint_items` |
| Jobs/runs | Link jobs to project/PRD and show status in model | Full run orchestration UI | Current support exists at data layer |
| Approvals | Queue + project context, severity, summary, decision trail | Multi-step approval workflows, policy builder | Must preserve owner/QC separation |
| Signals | Curated recent activity from core event types | Generic event-rule builder | Needs clear taxonomy |
| Documents | Upload/list project docs, link PRDs and artifacts | Versioned document workflows beyond PRD basics | Keep `project_documents` + `prds` for M1 |
| Usage/governance | Project-attributed usage visibility and cost rollups | Spend budgets, alert policies, billing | Use current rollup tables |
| Tenancy/auth | Current internal model | Workspaces, RBAC, SSO | Future phase |
| Runtime adapters | OpenClaw-backed flow | Multiple runtimes | M1 is OpenClaw-first |

### Milestone 1 exit criteria

M1 is complete only when:
1. an operator can create a project in under 2 minutes,
2. every new project gets an owner + QC recommendation,
3. a project workspace answers “what is this / who owns it / what needs attention / what changed”,
4. approvals are actionable with context,
5. recent signals are meaningfully better than raw events,
6. project state can be reconstructed from system data without relying on chat memory.

---

## 9. Functional specification

## 9.1 Intake specification

### Goal
Turn an ambiguous request into structured data that can drive routing and execution.

### M1 intake fields
Using the current repo taxonomy in `src/lib/project-intake.ts`:

#### Shape (single-select)
- `new-product`
- `improve-existing`
- `launch-campaign`
- `ops-system`
- `research-strategy`
- `hybrid-not-sure`

#### Context (multi-select)
- `customer-facing`
- `internal-team`
- `new-initiative`
- `existing-asset`
- `ai-enabled`

#### Capabilities (multi-select)
- `strategy`
- `ux-ui`
- `frontend`
- `backend-data`
- `content-copy`
- `growth-marketing`
- `qa-optimization`

#### Stage (single-select)
- `idea`
- `planning`
- `ready-to-design`
- `ready-to-build`
- `already-live`

#### Confidence (single-select)
- `clear`
- `somewhat-clear`
- `not-sure`

### Required fields
- project name
- shape
- stage
- confidence

### Optional fields
- context[]
- capabilities[]
- goals/notes
- uploaded docs

### Stored outputs
- `projects.type` derived bucket
- `projects.intake`
- `projects.intake_summary`
- `projects.description`
- initial project documents if uploaded

### Derived legacy type mapping
Per current implementation:
- `launch-campaign` → `marketing_growth`
- `ops-system` → `ops_enablement`
- `research-strategy` → `strategy_research`
- `hybrid-not-sure` or `confidence=not-sure` → `hybrid`
- else → `product_build`

### Acceptance criteria
- User can complete intake on mobile or desktop.
- Hybrid/uncertain requests have a safe path.
- Structured intake persists to the project record.
- `intake_summary` is readable in list/detail views.

---

## 9.2 Routing specification

### Goal
Recommend a primary owner lane and QC lane immediately, using deterministic, explainable logic.

### Inputs
- `intake.shape`
- `intake.context[]`
- `intake.capabilities[]`
- `intake.stage`
- `intake.confidence`
- optional manual override

### M1 owner routing rules
These should match the current repo behavior in `getRoutingSummary()` / `getAutoRouteTeamIdsFromIntake()`.

#### Primary owner logic
1. **Product owns first** when:
   - `confidence != clear`, or
   - `stage in [idea, planning]`, or
   - `shape in [research-strategy, hybrid-not-sure]`

2. **Marketing owns first** when:
   - `shape = launch-campaign`, or
   - `growth-marketing` materially dominates capability needs

3. **Engineering owns first** when:
   - `frontend` or `backend-data` is selected, or
   - `shape = new-product`

4. **Design owns first** when:
   - `ux-ui` is the main need and the request is already sufficiently scoped

5. Default fallback:
   - Product

### Team pull-in rules
These determine involved teams, even if they are not the primary owner.

- `strategy` → Product
- `ux-ui` → Design
- `frontend` / `backend-data` → Engineering
- `content-copy` / `growth-marketing` → Marketing
- `qa-optimization`, `ready-to-build`, `already-live` → QA

### QC lane rules
- Engineering owner → QA QC
- Design owner → Product QC
- Marketing owner → Product QC
- Product owner → QA QC

### Routing outputs
At minimum M1 must surface:
- `primary_owner_team`
- `qc_team`
- involved teams
- routing explanation string

### Routing explanation format
Each project should be able to render a simple explanation such as:

> Routed to Product because confidence is not-sure and stage is planning. Pulled in Engineering and Design because frontend and UX/UI capabilities were selected. QC assigned to QA because Product is the owner lane.

### Acceptance criteria
- Every created project gets owner + QC recommendation.
- Recommendation logic is visible in UI copy.
- Operator can override without losing the original recommendation in history.
- Routing produces a timeline/signal entry.

---

## 9.3 Project creation specification

### Goal
Create the durable container and enough structure to start execution.

### M1 create flow
On submit:
1. create `projects` row
2. persist `type`, `team_id`, `description`, `intake`, `intake_summary`
3. set `status = active`
4. set `progress_pct = 0`
5. create starter tasks per routed team using `sprint_items`
6. upload/store any project docs in `project_documents`
7. sync/roll up project state
8. optionally create GitHub repo for code-heavy projects

### Current starter task templates in repo
- Engineering → `Set up development environment and architecture`
- Design → `Create initial wireframes and design system`
- Product → `Define product requirements and user stories`
- Marketing → `Plan marketing strategy and messaging`
- QA → `Create test plan and quality criteria`

### Acceptance criteria
- New project appears immediately in projects list.
- Project detail page is reachable immediately.
- Starter tasks are created for involved teams.
- Project docs, if uploaded, appear in the documents section.

---

## 9.4 Task and job specification

### Goal
Track durable work separately from execution attempts.

### Task model for M1
Implementation table: `sprint_items`

Required fields in use:
- `id`
- `project_id`
- `sprint_id` nullable
- `title`
- `description`
- `status`
- `assignee_agent_id`
- `assignee_user_id`
- `position`
- timestamps

### Allowed task statuses for M1
- `todo`
- `in_progress`
- `done`
- `blocked`
- `cancelled`

### Job model for M1
Implementation table: `jobs`

Required fields in use:
- `id`
- `project_id`
- `prd_id`
- `title`
- `status`
- `owner_agent_id`
- `summary`
- timestamps

### Rules
1. Tasks are project-scoped durable work.
2. Jobs represent execution attempts against that work.
3. Blocked tasks should create attention surfaces.
4. Done tasks should update project progress.
5. Jobs should be attributable to project and optionally PRD.

### Acceptance criteria
- Operator can view backlog / in flight / blocked / done tasks.
- Blocked tasks are visible in workspace and signals.
- Jobs remain a separate concept from tasks in the data model.

---

## 9.5 Approval specification

### Goal
Put a human at the right decision point with enough context to act quickly.

### M1 approval types
Required logical types even if the table does not yet have `approval_type`:
- scope approval
- design direction approval
- launch approval
- QA sign-off
- escalation / decision request

### Current approval fields available
- `id`
- `project_id`
- `job_id`
- `agent_id`
- `requester_name`
- `severity`
- `status`
- `summary`
- `decided_by`
- `decided_at`
- `created_at`

### Required UI fields for each approval
- project name
- summary of requested decision
- requester identity
- severity
- linked job if present
- current status
- requested time / age
- action buttons: approve / reject / ask for changes

### Required approval statuses for M1
At minimum:
- `pending`
- `approved`
- `rejected`
- `changes_requested`

If the underlying DB currently only persists `pending` plus terminal decisions, M1 UI must still map clearly to these states.

### Rules
1. Owner lane cannot self-QC for the same gate.
2. Approval decisions must create durable event/timeline entries.
3. Approval queue must be browsable across projects.
4. Project page must show local approvals in context.
5. Severity must influence visual prominence.

### Acceptance criteria
- Pending approvals are visible in one queue.
- Approver can act without opening raw DB/log surfaces.
- Approval decision produces an event and updates project context.
- Operator can tell which approvals block progress.

---

## 9.6 Signal specification

### Goal
Create readable operational visibility from raw state changes.

### Signal sources for M1
Signals may be derived from:
- `agent_events`
- `approvals`
- `sprint_items`
- `jobs`
- `project_documents`
- `prds`
- usage rollups when materially relevant

### Required signal kinds in current UI language
- `blocked`
- `approval`
- `completed`
- `progress`
- `activity`

### Canonical M1 signal events
These are the minimum events that must create user-facing signals:
1. project created
2. project routed
3. task created
4. task blocked
5. task completed
6. approval requested
7. approval decided
8. document uploaded
9. PRD created or updated
10. project completed

### Signal object shape for UI
Current project detail already expects:
- `id`
- `kind`
- `title`
- `detail`
- `timestamp`
- `actorName?`

### Signal copy rules
Every signal should answer:
- what happened
- which object it affected
- whether action is needed

Good example:
> Approval requested for homepage direction. Design proposes Option B for the pricing hero. Product review needed.

Bad example:
> event_type=approval_requested payload={...}

### Prioritization rules
- blocked > approval > completed > progress > activity
- recent, blocking, and unresolved signals should sort highest
- low-value noise should remain in raw events, not the recent signals feed

### Acceptance criteria
- “Recent Signals” is readable by a non-technical stakeholder.
- Signals link back to evidence or context.
- Operators prefer the signal view over raw event logs for daily triage.

---

## 9.7 Document and PRD specification

### Goal
Treat documents as operational context, not detached attachments.

### M1 document model
Use existing structures:

#### `project_documents`
For uploaded files and external links.

Current fields:
- `id`
- `project_id`
- `type` in `prd_pdf | image | link | other`
- `title`
- `url`
- `storage_path`
- `mime_type`
- `size_bytes`
- `created_by`
- `created_at`

#### `prds`
For structured product docs.

Current fields across repo migrations include:
- `id`
- `project_id`
- `title`
- markdown body/content
- `version`
- `prev_version_id`
- `status`
- optional storage path / pdf url
- creator metadata
- timestamps

### M1 document rules
1. Every document belongs to a project.
2. A PRD is a specific document class with versioning intent.
3. Project detail must show documents in one predictable section.
4. Uploading a document should generate a signal.
5. PRD presence should be visible on project overview.

### M1 document types to support in UI
- PRD PDF
- image / screenshot
- external link (Figma, Google Doc, etc.)
- other file

### Acceptance criteria
- Operator can upload and list project documents.
- Uploaded document metadata is visible.
- PRDs can be attached to the project model.
- Document additions create readable signals.

---

## 10. Core user flows

## 10.1 Flow A — Create a project from ambiguous request

1. User enters project name.
2. User selects shape.
3. User selects context + capabilities.
4. User selects stage + confidence.
5. User optionally adds notes and docs.
6. System shows live routing preview: owner + QC.
7. User submits.
8. System creates project + starter tasks + docs.
9. Project workspace opens.

**Success condition:** operator understands ownership and next steps without extra triage.

## 10.2 Flow B — Review routing on a hybrid request

1. User submits hybrid / not-sure request.
2. System routes primary owner to Product.
3. System pulls in Design/Engineering/Marketing as needed.
4. UI explains why Product owns first and who else is involved.
5. Operator may override if needed.

**Success condition:** ambiguous work still gets a sane, explainable starting lane.

## 10.3 Flow C — Run delivery and monitor progress

1. Starter tasks are created per involved team.
2. Agents/humans update task states.
3. Project progress and recent signals update.
4. Blocked tasks appear in attention surfaces.
5. Operator inspects project workspace instead of reconstructing status manually.

**Success condition:** project page answers “what is happening right now?”

## 10.4 Flow D — Request and resolve approval

1. Agent or owner creates approval request.
2. Approval appears in global approvals queue and project page.
3. Approver sees summary, severity, requester, linked context.
4. Approver approves / rejects / requests changes.
5. Decision creates event + signal and updates project context.

**Success condition:** approvals are explicit, fast, and auditable.

## 10.5 Flow E — Inspect project documents and planning context

1. User opens project workspace.
2. User sees intake summary, goals, routing, docs, PRDs, and recent signals together.
3. User opens attached doc or PRD.
4. User returns to task board with context preserved.

**Success condition:** documents are part of delivery context, not a disconnected file list.

---

## 11. Information architecture

### Top-level modules for M1
1. Dashboard / operations overview
2. Projects list
3. Project workspace
4. Approvals queue
5. Agents / runtime registry
6. Usage view

### Required project workspace sections
1. **Overview / brief**
2. **Tasks / work board**
3. **Recent signals**
4. **Documents**
5. **Teams**
6. **Approvals summary**

### One-screen questions the project workspace must answer
- What is this?
- Who owns it?
- What stage is it in?
- What is blocked?
- What changed recently?
- What needs approval?
- What documents define the work?

---

## 12. Data model grounding in current repo

### Current tables directly relevant to M1
- `projects`
- `teams`
- `team_members`
- `sprint_items`
- `jobs`
- `approvals`
- `prds`
- `project_documents`
- `agent_events`
- `ai_usage_events`
- `usage_rollup_minute`

### Important current implementation notes
- `projects.type` is the active broad bucket, not `project_type`
- `projects.team_id` is the current primary team field
- `sprint_items.sprint_id` is nullable in the current implementation, enabling project-level task creation without a sprint
- `projects.progress_pct` is maintained via progress rollup logic
- `approval_requests` is currently a view over `approvals`
- `project_documents` exists as the cleanest current document model for M1

### Modeling decisions to lock now
1. Continue using `sprint_items` as the implementation table, but use **task/work item** in product copy.
2. Continue using `project_documents` + `prds` for M1 instead of forcing premature consolidation.
3. Keep routing rule-based and deterministic for M1.
4. Treat signals as a projection layer above events and state changes.

---

## 13. Success metrics

## 13.1 Product metrics for M1
1. **Median time to create project**: < 2 minutes
2. **Routing stickiness**: >= 80% of projects keep the initial owner/QC recommendation for first 24h
3. **Approval clarity**: >= 90% of sampled approvals have enough context to act without opening logs
4. **Project state trust**: >= 90% of sampled active projects have correct owner, progress, and blocked status
5. **Signal usefulness**: operators report using recent signals instead of raw events for daily triage
6. **Document visibility**: project docs are visible and accessible from project workspace for >= 95% of projects with uploads

## 13.2 Operational metrics
1. blocked tasks visible within one refresh cycle
2. approval decision timestamp recorded for all non-pending approvals
3. document upload generates timeline/signal entry
4. project progress updates when tasks move to done

---

## 14. Measurable acceptance criteria by area

### Intake
- `projects.intake` and `projects.intake_summary` are populated on create.
- User can submit uncertain/hybrid work without breaking the model.

### Routing
- Owner lane and QC lane are shown on project detail.
- Routing explanation can be rendered from deterministic logic.

### Project workspace
- Page shows brief, tasks, signals, docs, teams, progress.
- Operator does not need DB inspection to understand current state.

### Tasks/jobs
- Task board shows backlog, in flight, blocked, done.
- Jobs remain separately linkable to project/PRD.

### Approvals
- Pending approvals are accessible in queue and project context.
- Approval decision is timestamped and attributable.

### Signals
- At least the 10 canonical M1 events generate readable signal entries.
- Signal wording is stakeholder-readable.

### Documents
- Project docs list includes type, title, metadata, and link/path.
- PRD/document additions are visible on project page.

### Usage
- Usage is attributable to project in the underlying model and available for visibility.

---

## 15. Risks

1. **Overfitting to Vertillo internal language**
2. **Confusing tasks and jobs**
3. **Treating raw events as signals**
4. **Weak approval state model**
5. **Documents still behaving like detached attachments**
6. **Trying to jump to workspaces before M1 is trusted**

---

## 16. Recommended implementation sequence

1. Lock terminology in product copy: project / task / job / approval / signal / document.
2. Finish project workspace as the single operational page.
3. Strengthen approvals queue + project approval context.
4. Formalize signal generation rules from current events/state.
5. Tighten document + PRD display and linking.
6. Validate routing explanation and override path.

---

## 17. Final summary

BuildBeast should not be treated as “just a dashboard” or “OpenClaw with UI.”

Milestone 1 is the point where the product model becomes concrete:
- structured intake
- explainable routing
- durable projects
- tasks distinct from jobs
- explicit approvals
- readable signals
- documents inside the operating loop

If M1 is done correctly, Command Center becomes a credible internal control plane and the foundation for productization, instead of a founder-specific console held together by memory and vibes.

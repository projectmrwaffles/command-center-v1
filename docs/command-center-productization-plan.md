# Command Center Productization Plan

## Executive take

Command Center should **not** try to become “the whole OpenClaw product” in one move.

The right path is:

1. **V1 internal:** an operator console for Milo’s orchestrated agent work.
2. **V2 productized:** a reusable control plane for serious OpenClaw users running projects with agents, approvals, teams, and spend.
3. **Future SaaS:** a hosted orchestration + workflow product with opinionated abstractions, strong auditability, and pluggable execution surfaces.

The repo already points in the right direction: projects, teams, agents, jobs, approvals, events, usage, realtime, and structured intake. That is enough to define the product boundary. The main discipline now is deciding what stays an internal shortcut versus what becomes the long-term product model.

---

## 1) Command Center internal V1 — what it is and is not

## What V1 is

**V1 is an internal mission-control UI for Milo’s orchestrator workflow.**

It exists to answer five operator questions fast:

1. **What needs my attention right now?**
   - Pending approvals
   - Blocked work
   - Errors
2. **What is each active project doing?**
   - Status
   - Sprint progress
   - Assigned team
   - Current flags
3. **Which agents are active, idle, blocked, or unhealthy?**
4. **What happened recently?**
   - Event feed
   - Job and approval activity
5. **What is this costing?**
   - Token and model usage

In practical terms, V1 is a **human-in-the-loop delivery cockpit** for one operator and one operating model.

## What the current repo already supports

From the codebase and schema, V1 already has the bones of an internal operating system:

- **Projects** as the top-level work container
- **Structured intake** that routes projects by shape/stage/capability/confidence
- **Teams** representing functional departments
- **Agents** as runtime workers with status and identity
- **Jobs / sprint items** as execution units
- **Approvals** as explicit human decision gates
- **Agent events** as operational telemetry
- **AI usage** as spend/consumption tracking
- **Realtime updates** for the dashboard
- **Private project docs** upload path

That is enough for a very good internal V1.

## What V1 is not

V1 is **not** yet:

- A general-purpose multi-tenant product
- A full workflow builder
- A generic agent platform for arbitrary org structures
- A SaaS collaboration suite
- A billing product
- A polished end-user PM tool competing with Linear/Asana/Jira
- A reliable system-of-record for all execution state across every OpenClaw runtime

Most importantly:

**V1 is not “OpenClaw with a UI.”**

It is a thin, opinionated control surface around a specific orchestration model: Milo, Mr. Waffles, Vertillo-style teams, named specialists, QC approval rules, and Telegram-first coordination.

## The correct V1 product framing

Use this framing internally:

> Command Center V1 is the operator console for running AI-assisted delivery with explicit routing, approvals, and audit trails.

That framing is much better than “dashboard,” because it implies:

- action, not just reporting
- intervention, not passive monitoring
- control points, not just charts

## V1 success criteria

V1 succeeds if Milo can do these reliably:

- create a project in <2 minutes
- see owner + QC recommendation immediately
- know what requires intervention from one screen
- understand which projects are healthy vs drifting
- inspect agent activity without jumping between tools
- see spend without exporting logs
- preserve a readable record of why decisions happened

## V1 must-have scope

Lock V1 to these workflows:

### A. Intake → route → create project
- Structured intake
- Recommended owner team + QC team
- Project created with canonical metadata

### B. Active delivery visibility
- Project state
- Sprint/task progress
- Pending approvals
- Blocked work

### C. Agent operations visibility
- Agent status and last seen
- Current job
- Event stream
- Failure/blocked surfacing

### D. Human intervention
- Approval queue
- Project-level triage
- Reassignment / resolution paths

### E. Spend visibility
- Usage rollups by model/provider/agent/project

## V1 should explicitly defer

Do **not** bloat V1 with these yet:

- custom workflow designer
- fine-grained role builder
- marketplace of agents
- end-customer portals
- broad integrations catalog
- invoicing/billing
- sophisticated forecasting
- generalized memory/knowledge graph ambitions

Internal V1 needs sharpness, not surface area.

---

## 2) Productized V2 for broader OpenClaw users

## The V2 product thesis

**V2 is a reusable control plane for teams running AI agents on real work.**

Target user is not “everyone using AI.”
Target user is:

- founders
- operators
- agencies
- product teams
- internal innovation teams
- technical chiefs of staff

They are running recurring work through agents and need:

- intake
- routing
- approvals
- auditability
- visibility
- spend control
- basic collaboration

That is a real product.

## V2 product promise

> Run agent-assisted work like a real operation: clear intake, assigned owners, approval gates, live status, and auditable usage.

This is the strongest bridge between the current repo and a sellable product.

## Core V2 entities

V2 should standardize around these product entities:

- **Workspace** — top-level customer/account boundary
- **Project** — unit of work/outcome
- **Queue / Team** — who owns a class of work
- **Agent** — execution actor, human-managed or system-managed
- **Run / Job** — a discrete execution attempt
- **Task / Work item** — scoped deliverable within a project
- **Approval** — explicit required human decision
- **Artifact** — file, output, link, prompt pack, PRD, report
- **Event** — append-only audit feed
- **Usage record** — cost/tokens/time/resource consumption
- **Playbook** — reusable routing/execution policy

## V2 product modules

### 1. Intake and routing
This becomes a true product module, not just a form.

Capabilities:
- configurable intake templates
- routing rules
- owner/QC recommendations
- project classification
- optional file upload
- intake summary generation

### 2. Operations overview
Current dashboard evolves into:
- needs attention queue
- active projects
- agent health
- recent events
- usage snapshots

### 3. Approvals center
This should become a first-class module.

Capabilities:
- pending approvals inbox
- severity levels
- linked context
- approve / reject / ask for changes
- SLA aging
- audit trail

### 4. Project workspace
Per-project control page:
- brief/intake
- work items
- artifacts
- timeline
- assigned teams/agents
- blockers
- approvals
- spend

### 5. Agent registry
- registered agents
- capability tags
- health status
- auth model
- runtime source
- current/last run

### 6. Usage and governance
- model/provider usage
- spend alerts
- per-project usage
- policy controls
- approval thresholds

## V2 positioning

Do **not** position V2 as “another PM app.”
That is a losing frame.

Position it as one of these:

1. **Control plane for agent operations**
2. **AI delivery ops platform**
3. **Mission control for agent-assisted work**

My preference: **control plane for agent operations**.

It is specific, credible, and expandable.

## V2 ICPs

Best near-term customers:

### Primary ICP: AI-native agencies / studios
Why:
- already work in projects
- already juggle specialists
- already need approvals
- care about client delivery and margin
- understand routing and QA naturally

### Secondary ICP: founder-led product teams
Why:
- need leverage more than process purity
- often have one operator coordinating many tools
- willing to adopt opinionated systems

### Third ICP: internal ops / innovation teams
Why:
- need visibility and auditability
- can justify spend control
- likely to care about security and approvals

Avoid broad SMB/general productivity positioning early.

## V2 feature line in the sand

To be productized, V2 needs:

- workspaces
- multi-user auth
- workspace-scoped routing/config
- cleaner permissions
- stable project detail views
- proper approval interactions
- durable event timeline
- workspace/project usage views
- configurable teams/playbooks
- import path from internal defaults

Without those, it is still an internal tool with lipstick.

---

## 3) Future SaaS architecture and positioning

## Long-term product position

The future SaaS should be:

> The orchestration and governance layer between AI agents, human operators, and business work.

Not the model provider.
Not the IDE.
Not the chat app.
Not the task app alone.

It sits above execution and below business outcomes.

That is a durable layer if done right.

## Future architecture: three layers

### Layer 1: System of record
Hosted multi-tenant backend storing:
- workspaces
- projects
- tasks/runs
- approvals
- artifacts metadata
- event logs
- usage/accounting
- policies
- team/role config

This layer must be boring, reliable, queryable, and auditable.

### Layer 2: Orchestration/control layer
Services that:
- route work
- dispatch runs/jobs
- evaluate policy
- trigger approvals
- collect telemetry
- reconcile runtime state
- apply retries / timeout handling

This is where the product gets differentiated.

### Layer 3: Runtime adapters
Connectors to actual execution environments:
- OpenClaw local runtime
- hosted OpenClaw runtime
- CI workers
- browser runtimes
- MCP/server toolchains
- future external agent frameworks

This separation matters.

If you collapse these layers, the product becomes hard to govern and impossible to evolve cleanly.

## SaaS architecture principles

### A. Event-first, not page-first
The long-term system should treat the event log as canonical operational truth.

Pages are projections of:
- events
- current state snapshots
- derived rollups

Why:
- better auditability
- replayability
- easier debugging
- cleaner integrations later

### B. Policy-based control
Approvals, routing, allowed tools, spend caps, and escalation rules should become policy objects, not hardcoded logic.

### C. Runtime-agnostic execution
Command Center should not assume one agent runtime forever.
It can be OpenClaw-first, but not OpenClaw-only in architecture.

### D. Multi-tenant from the data model up
Even before full SaaS rollout, design around:
- workspace_id everywhere meaningful
- scoped policies
- scoped agents/runtimes
- auditable actor identity

### E. Strong identity model
Future product needs clean distinction between:
- human user
- system service
- agent identity
- runtime instance
- delegated action

That is essential for trust and enterprise viability.

## Future SaaS packaging

Potential packages:

### Team plan
- workspaces
- projects
- approvals
- usage visibility
- limited playbooks
- basic integrations

### Ops plan
- advanced governance
- custom routing rules
- approval policies
- spend thresholds
- multiple runtimes
- deeper logs and exports

### Enterprise plan
- SSO
- audit exports
- private runtime/hybrid deployment
- retention controls
- advanced RBAC
- custom connectors

## Strategic warning

Do not anchor the future SaaS story around “agent personas” as the core product primitive.

Personas are useful UI sugar.
They are not the durable architecture.

Durable primitives are:
- policies
- queues
- capabilities
- runs
- approvals
- events
- artifacts

Personas can sit on top.

---

## 4) Key product principles to lock now

These are the decisions worth locking immediately because changing them later is expensive.

## Principle 1: Human override is first-class
Command Center is not autonomous black-box automation.
It is supervised operations.

Implications:
- approvals are core, not edge cases
- operator intervention is a happy path
- blocked states are explicit
- every important action should be inspectable

## Principle 2: Projects are the business container; runs are the execution container
Do not confuse long-lived business work with short-lived execution attempts.

- Project = outcome and context
- Run/job = execution unit
- Task/work item = planned unit of scope

This distinction must stay clean.

## Principle 3: Event log is sacred
Every meaningful state transition should be representable as an event.

Examples:
- project created
- intake classified
- run assigned
- approval requested
- approval decided
- run blocked
- artifact uploaded
- policy violated
- usage recorded

## Principle 4: Routing is a product capability, not just internal ops glue
The current intake/routing logic is already one of the most valuable pieces.
Treat it like product IP.

That means:
- canonical taxonomy
- explainable routing
- editable playbooks later
- visible owner + QC logic

## Principle 5: Opinionated defaults, configurable later
Early product wins come from strong defaults.
Do not lead with a blank canvas.

Start with:
- common intake templates
- standard team types
- default approval paths
- default severity rules

Then progressively open configuration.

## Principle 6: Governance and cost visibility are features, not admin residue
A lot of AI tools treat governance as an enterprise afterthought.
That is a mistake.

For Command Center, governance is part of the value:
- what ran
- who approved it
- what it cost
- what changed
- where it failed

## Principle 7: Realtime is useful, but durability matters more
Live dashboards are nice.
Reliable state and audit trails matter more.

If forced to choose, choose:
- durable event capture
- consistent projections
- recoverable state

before fancy live polish.

---

## 5) Milo-specific shortcuts vs future product model

This is the section to be brutally honest about.

## Milo-specific shortcuts in the current concept

### 1. Named specialist agents as org structure
Examples:
- Compass
- Oracle
- Bolt
- Shield
- Mr. Waffles

These are great internal operating metaphors.
They are **not** the future product data model.

Future model:
- team
- role
- capability set
- playbook
- agent configuration

Personas can remain as labels or presets.

### 2. Vertillo department map as default routing ontology
Engineering / Design / Product / Marketing / QA is a fine internal setup.
But many customers will want:
- support
- legal
- sales ops
- finance ops
- IT/security
- research

Future model:
- configurable queues/teams
- capability mappings
- approval chains

### 3. Telegram as decision source of truth
For Milo, Telegram can be the command layer.
For product, it cannot be the canonical system.

Future model:
- Command Center is system of record
- chat surfaces are interfaces/adapters
- Slack/Telegram/email become notification + command entry points

### 4. One operator / chief-of-staff mental model
Current V1 assumes one strong operator managing everything.
Real product users will have:
- multiple requesters
- multiple approvers
- multiple operators
- stakeholders with partial visibility

Future model:
- requester
- operator
- approver
- admin
- observer roles

### 5. Hardcoded QC rules
Current QC mapping is good and useful.
It is still mostly a fixed ruleset.

Future model:
- policy engine
- configurable review requirements
- severity-based approvals
- environment/risk-based gates

### 6. OpenClaw-native assumptions everywhere
This is fine for now.
But future product model should separate:
- platform concepts
- OpenClaw adapters
- runtime-specific telemetry

### 7. “Project” standing in for every work type
Today that is acceptable.
Later there may be:
- requests
- incidents
- campaigns
- recurring workflows
- one-off runs

Future model should keep project as a major container, but not force every workflow into that shape.

## Things that should survive into the product model

These internal ideas are actually strong product abstractions:

- **Needs You** queue
- explicit **approval** objects
- structured **intake taxonomy**
- owner + QC separation
- **event timeline**
- usage tied to operational units
- agent/team visibility in one place
- artifact attachment to work context

Those are worth preserving almost intact.

---

## 6) Phased roadmap

## Phase 0 — tighten internal V1 (now)

Goal: make the current app genuinely useful every day.

### Deliverables
- solid project creation and intake persistence
- stable project detail page
- stable approvals list/detail interactions
- agent detail pages
- event feed with readable labels/context
- usage page with project/agent/model breakdown
- fix terminology drift (`type` vs `project_type`, team IDs, project detail routes, etc.)
- basic empty/error/loading states everywhere

### Why this phase matters
Without this, strategy is fictional. The product needs an actually-used internal operating loop.

### Exit criteria
- Milo can run real internal projects from it for at least 2–4 weeks
- daily usage is plausible without falling back to raw logs for everything
- main failure modes are known and documented

## Phase 1 — internal operations hardening

Goal: make V1 trustworthy enough to be the operational source of truth for active delivery.

### Deliverables
- canonical data model cleanup
- append-only event model or at least much stronger event discipline
- approval actions with audit trail
- agent auth cleanup
- project/task/run linkage clarity
- usage rollups by project/workspace/agent
- doc/artifact model cleanup
- operational alerts for blocked/stale/error states

### Exit criteria
- one project can be reconstructed from intake to delivery from the database alone
- approvals and interventions are auditable
- state drift is detectably lower

## Phase 2 — productization foundation

Goal: remove Milo-specific assumptions without losing product sharpness.

### Deliverables
- introduce `workspace` model
- workspace membership and roles
- team/queue configuration
- configurable routing playbooks
- replace hardcoded Vertillo naming in product-facing surfaces
- invite users to workspace
- basic project permissions
- workspace-level settings

### Exit criteria
- a new workspace can be created without custom code
- a non-Milo org can understand the product without internal lore
- routing still feels opinionated, not generic mush

## Phase 3 — private beta

Goal: validate with 3–10 design partners.

### Recommended customers
- AI-native agency
- founder-led software team
- internal ops/innovation group

### Deliverables
- onboarding flow
- workspace templates
- Slack/Telegram notification integration
- better approvals UX
- project timeline
- billing/spend reporting basics
- analytics on time-to-approval, blocked rate, usage per project

### Success metrics
- weekly active operators
- projects created per workspace
- approval turnaround time
- percent of runs/work tracked in product
- spend visibility adoption
- retention after initial setup

## Phase 4 — hosted SaaS control plane

Goal: become the system of record for supervised agent operations.

### Deliverables
- managed hosted deployment
- robust multi-tenant isolation
- policy engine
- runtime connectors
- SSO and audit exports
- retention and governance controls
- self-serve workspace provisioning

### Exit criteria
- product works without founder handholding
- security posture is credible
- runtime integration is stable enough for paid usage

---

## 7) Risks and prerequisites

## Biggest strategic risks

### Risk 1: Building a dashboard, not a product
A lot of internal tools look impressive but do not change behavior.

Mitigation:
- anchor every screen to an operator action
- measure intervention loops, not page views
- prioritize approvals, routing, and decision support over cosmetic reporting

### Risk 2: Overfitting to Milo’s operating style
If you productize internal language directly, the result will feel like someone else’s org chart.

Mitigation:
- separate internal presets from canonical model
- use configurable teams/queues in V2
- keep personas as optional skins/templates

### Risk 3: State model confusion
Today there are hints of overlap across projects, jobs, sprint items, events, and approvals.
That will become painful fast.

Mitigation:
- define canonical lifecycle and ownership for each entity
- publish a domain model doc
- make projection logic explicit

### Risk 4: Weak identity and permission boundaries
Agent auth, admin auth, and workspace scoping will make or break trust.

Mitigation:
- clean actor model
- clean workspace scoping
- policy review before beta
- stop relying on temporary admin shortcuts

### Risk 5: Realtime polish masking weak durability
Realtime makes demos feel strong while underlying state remains fragile.

Mitigation:
- prioritize event durability and reconciliation
- add drift detection and recovery paths
- treat realtime as projection, not source of truth

### Risk 6: No clear wedge against existing tools
If the product looks like “Asana plus AI,” it will be forgettable.

Mitigation:
- lean into approvals, routing, auditability, and governance
- be the control plane, not the generic task app

## Operational prerequisites before serious productization

### Product prerequisites
- define target ICP first: agency vs product team vs internal ops
- pick one primary wedge and messaging line
- standardize terminology

### Data/model prerequisites
- canonical ERD/domain model
- clear lifecycle definitions
- workspace scoping plan
- event taxonomy

### Technical prerequisites
- auth/identity cleanup
- RLS review
- consistent API surface
- artifact/document model hardening
- migrations cleanup and reset strategy
- observability for runtime and sync failures

### UX prerequisites
- clear project detail information architecture
- approval interaction patterns
- operator inbox/queue design
- understandable empty/error states

### Go-to-market prerequisites
- 3–5 design partners with real work
- onboarding playbook
- template pack by use case
- pricing hypothesis tied to control/governance value, not raw seat count alone

---

## Recommended product decisions to make now

If I were making the calls this week, I would lock these:

1. **Positioning:** “Command Center is the control plane for agent operations.”
2. **V1 boundary:** internal operator console only; do not pretend it is already a general SaaS.
3. **Canonical primitives:** workspace, project, task/work item, run/job, approval, artifact, event, usage, playbook.
4. **Keep personas as presets, not core architecture.**
5. **Treat structured intake + routing as core IP.**
6. **Make approvals and audit trail the center of the product story.**
7. **Require a domain model cleanup before broadening scope.**

---

## Suggested near-term build order

Over the next few sprints, the highest-leverage order is:

1. **Project detail page** that actually ties intake, tasks, approvals, docs, events, and usage together
2. **Approvals center** with real actions and audit history
3. **Domain model cleanup** across project/job/task/event terminology
4. **Usage rollups by project and agent**
5. **Workspace abstraction** behind current internal defaults
6. **Configurable routing playbooks**

That sequence preserves momentum while moving the repo toward a real product.

---

## Bottom line

Command Center has a credible path to product, but only if it resists two traps:

- becoming a thin internal dashboard with no durable product abstraction
- becoming an over-generalized platform before the operating loop is proven

The smart move is to make V1 undeniably useful internally, then productize the **control plane**: intake, routing, approvals, visibility, auditability, and spend governance for agent-assisted work.

That wedge is real, differentiated, and already visible in the repo.
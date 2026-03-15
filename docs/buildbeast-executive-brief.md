# BuildBeast Executive Brief

**Date:** 2026-03-14  
**Status:** 1-page internal executive brief  
**Owners:** Compass + Oracle

## What BuildBeast is

BuildBeast is the productized future of Command Center: a **control plane for agent-assisted delivery**.

It gives operators one place to move work from:

**messy request → structured intake → routed ownership → supervised execution → approvals → signals → shipped outcome**

This is not just a PM dashboard and not just a wrapper around OpenClaw. The value is the operating layer between AI runtimes and real delivery work.

## The problem

Teams using AI still struggle with the basics of running work:
- requests arrive vague
- routing is inconsistent
- execution state is fragmented
- approvals arrive late or without context
- logs are noisy and hard to act on
- docs and PRDs are not integrated into the delivery loop

## Product promise

> One place to intake, route, orchestrate, supervise, and audit agent-assisted work until it ships.

## Milestone 1 focus

Milestone 1 is not SaaS. It is the internal proving ground that locks the core product model.

### In scope
- guided intake with structured fields
- explainable owner + QC routing
- project creation with starter tasks
- trusted project workspace
- task board distinct from jobs/runs
- approvals with severity and audit trail
- recent signals derived from events/state
- documents + PRDs attached to project context
- project-level usage visibility

### Out of scope
- workspaces / multi-tenancy
- enterprise RBAC / SSO
- workflow builder
- multi-runtime support beyond OpenClaw
- billing and self-serve onboarding

## Core design decisions

1. **Project, task, and job are different objects.**  
   Project = durable outcome. Task = scoped work. Job/run = execution attempt.

2. **Owner and QC stay separate.**  
   BuildBeast is supervised operations, not self-approval.

3. **Routing is a product feature.**  
   Intake + routing logic is part of the moat.

4. **Signals are curated summaries, not raw logs.**  
   The product should answer “what changed that matters?”

5. **Documents are part of execution context.**  
   PRDs, screenshots, and links belong inside the project workspace.

## Milestone 1 routing rules

Use deterministic routing first:
- **Product** owns first when confidence is low, stage is early, or request is hybrid/strategy-heavy
- **Engineering** owns first when build-heavy capabilities dominate or shape = new product
- **Marketing** owns first for launch/growth work
- **Design** owns first when UX/UI is the main need and the work is already scoped

QC lane:
- Engineering → QA
- Design → Product
- Marketing → Product
- Product → QA

## What success looks like

Milestone 1 succeeds when:
- median project creation time is under 2 minutes
- every new project gets an owner + QC recommendation
- operators can trust the project workspace as the operational source of truth
- approvals are actionable without opening raw logs
- recent signals are more useful than the raw event feed
- documents and PRDs are visible in the same context as tasks and approvals

## Biggest risks

- overfitting to Milo/Vertillo-specific language
- confusing tasks with jobs/runs
- shipping noisy activity instead of real signals
- weak approval state design
- treating documents like detached files instead of working context
- trying to jump to SaaS before the internal model is trusted

## Bottom line

BuildBeast has a credible wedge:

**the control plane for serious agent operations**

The smart move is to prove the model internally first, then productize the abstractions that survive real use: intake, routing, approvals, signals, documents, and supervised execution.

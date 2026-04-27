<!-- design-md export placeholder -->
<!-- source: docs/design/project-intake/DESIGN.md -->

# Project Intake DESIGN.md

## TL;DR
- **Initiative:** Project intake redesign and operating model
- **Owner:** Product + Engineering
- **Status:** Draft
- **Last updated:** 2026-04-27
- **Related links:** `docs/project-intake-redesign-spec.md`, `docs/buildbeast-prd.md`, `src/lib/project-intake.ts`, `src/app/projects/new/page.tsx`

## Problem
The repo already has a meaningful project-intake flow, but the design intent is spread across implementation notes, specs, and product docs. That makes it harder for the team to align on why the intake model exists, what decisions are already locked, and what changes should preserve the core workflow.

## Context
Command Center V1 is being shaped into an internal proving ground for BuildBeast: structured intake feeds routing, project creation, task bootstrapping, approvals, and project-detail visibility. The repo already supports selection-first intake, structured `projects.intake` payloads, `intake_summary`, and routing helpers in `src/lib/project-intake.ts`.

The next gap is workflow maturity. We need one living artifact that can answer:
- what user problem the intake flow solves
- what product and routing behaviors are intentional
- what is still flexible versus already encoded in the repo
- how design, product, and engineering should review intake changes together

## Goals
- Make project-intake intent legible in one living design artifact.
- Preserve the repo’s core structured-intake and explainable-routing model.
- Give future intake changes a review anchor before they spread across UI, routing, and data model changes.
- Create a pilot example the team can use as the first DESIGN.md in the repo.

## Non-goals
- Rewriting the current intake implementation from scratch.
- Finalizing every wording choice or routing rule forever.
- Replacing detailed implementation specs, PRDs, or code-level verification scripts.

## Users / operators affected
- Primary users: internal operators creating projects from messy client or product requests.
- Internal operators: Product, Design, Engineering, QA, and anyone changing intake or routing behavior.
- Reviewers / approvers: initiative owner plus the downstream team most affected by routing or intake-shape changes.

## Proposed approach
Adopt `docs/design/<initiative-slug>/DESIGN.md` as the canonical home for initiative-level design thinking. For project intake, the pilot doc should sit beside future exports or supporting notes and summarize the stable product logic already present in the repo.

For this initiative specifically, the DESIGN.md should be used to track:
- the project-intake problem statement
- current canonical intake fields and option taxonomy
- routing and team-assignment intent
- the boundary between intake design, implementation specs, and verification scripts
- rollout questions for future intake iterations

## Key decisions
| Decision | Choice | Why |
| --- | --- | --- |
| Canonical path | `docs/design/project-intake/DESIGN.md` | Keeps initiative docs predictable and colocated with future artifacts |
| Pilot scope | Start from current intake redesign work already in repo | Lowers adoption friction and grounds the artifact in real work |
| Workflow posture | Treat DESIGN.md as living and reviewable, not a one-time handoff | Intake logic affects multiple teams and changes over time |
| Tooling posture | Add safe repo-local placeholders first | Lets the team start now without blocking on upstream tooling install |

## Alternatives considered
1. **Keep using standalone spec files only** — easy in the short term, but it keeps context fragmented across docs and code.
2. **Wait for full Google design.md tooling before adoption** — cleaner eventual integration, but delays workflow change and team practice.
3. **Put design docs at repo root** — simpler path, but scales poorly once multiple initiatives need adjacent support artifacts.

## Scope
### In scope
- Design doc folder convention for initiatives.
- A reusable DESIGN.md template for this team.
- Pilot DESIGN.md for project intake.
- Lightweight scripts and guidance that make the workflow real in-repo.

### Out of scope
- Enforcing design-doc review in CI right now.
- Retrofitting every existing spec in `docs/` into DESIGN.md immediately.
- Solving final export/rendering workflow for non-Markdown consumers.

## Delivery plan
### Phase 1
- Add location convention, template, and README guidance.
- Add placeholder `design:lint`, `design:diff`, and `design:export` scripts.
- Publish the pilot `docs/design/project-intake/DESIGN.md`.
- Verification: run the new scripts and confirm expected files exist.

### Phase 2
- Connect placeholders to official Google design.md tooling after package/install choice.
- Decide when PRs must link or update a DESIGN.md.
- Backfill additional high-leverage initiatives as needed.

## Risks and mitigations
| Risk | Impact | Mitigation |
| --- | --- | --- |
| Team ignores the new convention | Medium | Keep path simple, add kickoff training, and reference the doc in real intake work |
| Placeholder tooling becomes permanent by accident | Medium | Document that scripts are temporary and explicitly call out the next integration step |
| DESIGN.md duplicates other docs | Medium | Position it as the cross-functional decision layer, with links out to specs and code |

## Open questions
- Which upstream Google design.md package or CLI should this repo standardize on?
- Should DESIGN.md updates become part of the definition of done for non-trivial features?
- Which existing initiative should be the second pilot after project intake?

## Rollout and verification
- Verify the convention with `docs/design/README.md` and the template path.
- Run `npm run design:lint` to confirm the repo foundation is present.
- Run `npm run design:diff` to compare the template against the pilot artifact.
- Run `npm run design:export` to produce a local export placeholder artifact.
- During rollout, ask initiative leads to link the active DESIGN.md from specs, PRs, or implementation plans.

## Change log
- 2026-04-27 — Initial pilot draft created from the current project-intake redesign work in this repo.

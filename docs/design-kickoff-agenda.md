# DESIGN.md kickoff agenda

## Goal
Help the team adopt DESIGN.md as a lightweight, living artifact for cross-functional initiative design.

## Suggested 30-minute agenda

### 1. Why we are doing this (5 min)
- DESIGN.md gives Product, Design, Engineering, and QA one shared decision artifact.
- It reduces scattered context across specs, PRs, and implementation notes.
- We are starting with project intake because it already spans product logic, routing, UI, and operations.

### 2. Repo convention walkthrough (5 min)
- Path convention: `docs/design/<initiative-slug>/DESIGN.md`
- Template: `docs/design/_template/DESIGN.md`
- Pilot example: `docs/design/project-intake/DESIGN.md`

### 3. How to use it in practice (10 min)
- Start a DESIGN.md when work is cross-functional or materially changes workflow behavior.
- Use it to capture problem framing, goals, decisions, scope, risks, and rollout.
- Link out to PRDs, implementation plans, code, and verification scripts instead of duplicating everything.
- Update it when major decisions or rollout plans change.

### 4. Tooling and workflow today (5 min)
- `npm run design:lint`
- `npm run design:diff`
- `npm run design:export`
- These are placeholders for now, but the convention is live immediately.

### 5. Decisions to leave the room with (5 min)
- Who owns DESIGN.md for each initiative?
- When is a DESIGN.md required versus optional?
- What is the next initiative to pilot after project intake?

## Prep for attendees
- Read `docs/design/README.md`
- Skim `docs/design/project-intake/DESIGN.md`
- Bring one current initiative that may need a DESIGN.md next

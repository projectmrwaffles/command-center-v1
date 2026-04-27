# DESIGN.md workflow

## Location convention

Store each initiative design doc at:

```text
docs/design/<initiative-slug>/DESIGN.md
```

Examples:
- `docs/design/project-intake/DESIGN.md`
- `docs/design/approval-workflow/DESIGN.md`

## How this repo uses DESIGN.md

- Use `DESIGN.md` for cross-functional problem framing before or during implementation.
- Start from `docs/design/_template/DESIGN.md`.
- Keep one folder per initiative so notes, exports, diagrams, and follow-up artifacts can live beside the design doc.
- Treat the design doc as a living artifact: update it when scope, decisions, risks, or rollout plans materially change.
- Link the active design doc from PRs, implementation plans, and handoff notes when the work is non-trivial.

## Current repo support

This repo now wires the convention to the native Google `@google/design.md` tooling:

```bash
npm run design:lint
npm run design:diff
npm run design:export
```

Defaults:
- `design:lint` validates `docs/design/project-intake/DESIGN.md`
- `design:diff` compares `docs/design/_template/DESIGN.md` against the pilot doc
- `design:export` writes a DTCG token export to `docs/design/project-intake/DESIGN.dtcg.json`

Each wrapper also accepts explicit file arguments when a future initiative needs a different target.

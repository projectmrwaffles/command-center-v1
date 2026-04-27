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

This rollout slice adds repo-local scripts so the team can start using the convention immediately:

```bash
npm run design:lint
npm run design:diff
npm run design:export
```

These are safe placeholders today. They verify the repo structure and make room for the official Google design.md tooling hookup later, without blocking adoption now.

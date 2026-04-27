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
npm run verify:design
```

Defaults:
- `design:lint` validates every `DESIGN.md` found under `docs/design/**`.
- `design:diff` compares `docs/design/_template/DESIGN.md` against the pilot doc.
- `design:export` writes a DTCG token export to `docs/design/project-intake/DESIGN.dtcg.json`.
- `verify:design` is the CI-friendly gate and currently runs the same lint-all check.

Wrappers still accept explicit file arguments when a specific initiative needs a narrower target.

## Repo enforcement

Design doc linting is no longer only a local convention:

- GitHub Actions runs `.github/workflows/design-md.yml` on pushes to `main` and pull requests that touch design docs or the lint wiring.
- The workflow installs dependencies and runs `npm run verify:design`.
- When adding a new initiative, create `docs/design/<initiative-slug>/DESIGN.md` from the template and make sure `npm run design:lint` passes before opening the PR.

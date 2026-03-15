# Command Center V1 — Repo Audit + Execution Plan

_Last updated: 2026-03-15_

## Audit snapshot

### Stack / runtime
- Next.js 16 app router
- React 19
- TypeScript + ESLint
- Supabase for data, RLS, realtime, storage-backed project docs
- Zustand client store for live dashboard state

### What is already in motion
- Structured intake is implemented in the create-project flow.
- Canonical intake helpers exist in `src/lib/project-intake.ts`.
- Project links are modeled and sanitized in `src/lib/project-links.ts`.
- Project/task lifecycle sync now exists in `src/lib/project-state.ts`.
- Project detail page now exposes intake, links, documents, teams, signals, and a task board.
- Migrations exist for intake + project links.
- BuildBeast docs/PRDs are now sitting in `/docs`, but they are still mostly passive files rather than first-class operational artifacts.

### Current gaps blocking a trustworthy V1
1. **Approvals are not yet a strong audit surface**
   - page is thin
   - limited context
   - decisions do not create explicit event-log records
   - project/dashboard visibility depends on indirect state
2. **Project/task/job model is clearer in code, but not yet obvious in operator UX**
   - tasks can be edited only partially from project detail
   - operator intervention loop is still weak
3. **Signals are present but not fully hardened**
   - dashboard server payload still uses raw IDs in places
   - blocked sprint-item signals are underrepresented in project rollups
4. **Realtime is useful, but projections still need better defaults**
   - dashboard degrades into low-context labels instead of readable operator state
5. **Internal-hardening toward BuildBeast is incomplete**
   - PRDs/docs exist, but approval/project surfaces do not consistently expose decision context

## Recommended V1 finish order

### P0 — must land now
1. **Approval audit hardening**
   - write an explicit `approval_decided` event on approve / request changes
   - enrich approvals UI with project/job/agent context and aging
   - revalidate dashboard + approvals after decisions
2. **Operator intervention on project detail**
   - allow task status changes and deletion inline
   - keep project progress/status synced automatically
3. **Readable signals on dashboard/project detail**
   - resolve names instead of raw IDs where possible
   - include blocked work in clearer operator-facing summaries

### P1 — next pass
4. **Project links + doc management UX**
   - edit links from project detail
   - better artifact typing (`PRD`, `brief`, `spec`, `reference`)
5. **Approvals center as a real inbox**
   - filters by severity / aging / project
   - project deep-links and richer decision notes
6. **Domain model doc**
   - publish canonical definitions for project vs task vs job vs approval vs event vs artifact

### P2 — productization / BuildBeast direction
7. **Workspace abstraction behind internal defaults**
8. **Policy-based routing + approval rules**
9. **Append-only event discipline / replayable projections**

## Safe implementation scope for today

The highest-impact safe changes to land immediately are:
- approval event logging + context-rich approvals page
- task board intervention hardening on project detail
- dashboard/project signal readability cleanup

These improve trust, operator speed, and auditability without changing the core schema in risky ways.

## Verification standard
- `npm run lint`
- `npx tsc --noEmit`
- manual smoke test of:
  1. create/edit task from project detail
  2. approve / request changes from approvals page
  3. confirm dashboard + project detail reflect updated signals

## QC owner
- **Owner:** Oracle
- **QC Approver:** Shield

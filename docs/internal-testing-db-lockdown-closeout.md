# Internal Testing DB Lockdown Closeout

Date: 2026-03-15
Repo: `command-center`
Target Supabase project ref: `yhyxxjeiogvgdsfvdkfx`

## What remains blocked

The latest DB hardening migration is **present in-repo** but **not applied on the current target environment**.

Required migration files:

- `supabase/migrations/20260315100500_lock_down_anon_policies.sql`
- `supabase/migrations/20260315143000_close_remaining_public_reads.sql`

## Live verification from this machine

Using `.env.local` credentials for anon + service-role API verification, the target environment still allowed anon reads on internal tables that should be locked down:

| table | service count | anon count | expected anon count |
|---|---:|---:|---:|
| projects | 7 | 7 | 0 |
| sprints | 6 | 6 | 0 |
| sprint_items | 20 | 20 | 0 |
| agents | 18 | 18 | 0 |
| jobs | 7 | 7 | 0 |
| approvals | 2 | 2 | 0 |
| project_documents | 1 | 1 | 0 |
| prds | 0 | 0 | 0 |
| agent_events | 0 | 0 | 0 |
| team_members | 13 | 13 | 0 |
| teams | 5 | 0 | 0 |

This proves the closeout lock-down has not been applied remotely yet.

## Smoke result before remote migration

`npm run verify:smoke` failed immediately with:

```text
FAIL - anon cannot read internal team membership: service sees 13, anon sees 13
```

## Safe apply workflow

I could not safely apply the remote migration from this machine because no DB password or Supabase management access token was available locally, and the repo intentionally retired embedded migration runners.

Use one of the official Supabase workflows below.

### Option A — Supabase SQL Editor (safest when dashboard access is already available)

1. Open the target project `yhyxxjeiogvgdsfvdkfx` in Supabase.
2. Open **SQL Editor**.
3. Run the contents of these files in order:
   1. `supabase/migrations/20260315100500_lock_down_anon_policies.sql`
   2. `supabase/migrations/20260315143000_close_remaining_public_reads.sql`
4. Confirm both scripts complete without errors.
5. Rerun verification:

```bash
npm run verify:closeout
npm run verify:smoke
```

### Option B — Supabase CLI (official, if DB password is available)

```bash
npx supabase db push
```

If prompted, provide the remote DB password for project `yhyxxjeiogvgdsfvdkfx`, then rerun:

```bash
npm run verify:closeout
npm run verify:smoke
```

## Repo-side verification hardening added here

To prevent a false “ready” signal, `scripts/internal-ready-smoke.js` now verifies anon cannot read all major internal surfaces covered by the closeout migration, not just `team_members` and `sprint_items`.

That list now includes:

- `projects`
- `sprints`
- `sprint_items`
- `agents`
- `jobs`
- `approvals`
- `project_documents`
- `prds`
- `agent_events`
- `team_members`

## Definition of done for backend closeout

Backend is ready for internal testing only after:

1. both lock-down migrations above are applied to the target Supabase environment
2. `npm run verify:closeout` passes
3. `npm run verify:smoke` passes end-to-end against that same environment

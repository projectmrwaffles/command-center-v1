# Command Center V1

Internal command-and-control surface for projects, agents, approvals, proof review, usage, and real-time orchestration.

## Core commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run verify:closeout
npm run verify:smoke
```

## Required environment

Local verification expects these env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGENT_AUTH_TOKEN` *(optional but recommended for full `/api/agent/log` route verification)*

Optional:

- `SMOKE_BASE_URL` — target an already-running app instead of auto-starting local dev server
- `SMOKE_PORT` — port for the local smoke-runner server (default `3210`)
- `SMOKE_START_LOCAL_SERVER=0` — skip auto-start when `SMOKE_BASE_URL` is not set

## Verification flow

### Static closeout verifier

```bash
npm run verify:closeout
```

Checks for:

- auth guards on all API routes
- scoped task updates in `/api/agent/log`
- project existence + payload sanitization in `/api/projects/[id]/documents`
- no hardcoded production fallback URL in project-trigger flow

### Internal-ready smoke verifier

```bash
npm run verify:smoke
```

Runs a disposable end-to-end backend smoke pass against local or provided app URL:

- confirms anon cannot read `team_members` or `sprint_items`
- confirms `/api/projects` rejects unauthorized requests and accepts trusted bearer auth
- creates a disposable project through the API
- verifies initial task bootstrap
- proves malformed document payloads are rejected
- proves valid document uploads are sanitized and persisted
- if `AGENT_AUTH_TOKEN` is present: proves `/api/agent/log` rejects cross-project task tampering, scoped task updates succeed, and usage validation rejects negative metrics
- if `AGENT_AUTH_TOKEN` is absent: proves anon cannot write `agent_events`/`ai_usage` directly while service-role backends can
- cleans up all disposable records afterward

## Notes

- `verify:smoke` is meant for internal verification, not public CI, because it needs live Supabase credentials.
- The smoke script cleans up the disposable project and related rows on success or failure.

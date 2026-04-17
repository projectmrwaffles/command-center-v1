# Attachment worker operations

Command Center now has a concrete host-side worker path for attachment processing on the Mac mini.

## Local commands

```bash
npm run worker:attachment:once
npm run worker:attachment
npm run worker:attachment:install-launchd
npm run ops:runtime:reset
npm run ops:runtime:reset:restart-worker
```

- `worker:attachment:once` claims queued attachment jobs once, then exits.
- `worker:attachment` runs the durable polling loop. Set `ATTACHMENT_WORKER_POLL_SECONDS=15` to tune cadence.
- `worker:attachment:install-launchd` installs and starts `com.command-center.attachment-worker` under `~/Library/LaunchAgents`.
- `ops:runtime:reset` prunes stale `.ops-runtime` scratch, run-log, and dead lock state without touching durable project history.
- `ops:runtime:reset:restart-worker` does the same prune, then reloads and kickstarts the launchd attachment worker when its plist is installed.

## launchd behavior

The install script writes a plist that:
- runs from this repo root
- starts automatically at login
- keeps the worker alive
- writes logs to `.ops-logs/attachment-worker.log`

At runtime, the worker now also:
- self-restarts when repo `HEAD` changes, so long-lived processes do not keep stale code loaded
- uses a lock file under `.ops-runtime/locks` and clears dead-owner locks on boot
- prunes stale `.ops-runtime` scratch and run-log state on startup

Useful commands:

```bash
launchctl print gui/$(id -u)/com.command-center.attachment-worker
launchctl kickstart -k gui/$(id -u)/com.command-center.attachment-worker
launchctl unload ~/Library/LaunchAgents/com.command-center.attachment-worker.plist
```

## Verification proof

Use the built-runtime proof script after `npm run build`:

```bash
npm run verify:attachment-pdf-built-runtime
```

That verification boots the built Next server, uploads fixture PDFs through the built `/api/projects/:id/documents/upload` route, confirms the job is queued, runs the worker against the real database/storage path, and verifies the project ends with derived requirements plus seeded kickoff state.

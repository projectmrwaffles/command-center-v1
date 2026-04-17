import process from 'node:process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';
import runtimeHardening from './runtime-hardening.js';

dotenv.config({ path: '.env.local' });

const { runAttachmentWorkerOnce } = await import('./attachment-worker.mjs');
const { acquireProcessLock, maybeRestartForUpdatedSource, pruneRuntimeState, readGitHead, resolveRuntimeSubdir } = runtimeHardening;

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const bootGitHead = readGitHead(repoRoot);
const pollSeconds = Math.max(1, Number(process.env.ATTACHMENT_WORKER_POLL_SECONDS || '15'));
const runOnce = process.argv.includes('--once');
const runtimeLockDir = resolveRuntimeSubdir(repoRoot, 'locks');
const workerLock = acquireProcessLock(runtimeLockDir, 'attachment-worker');
if (workerLock.staleCleared) {
  console.warn('[attachment-worker] Removed stale worker lock before starting');
}
pruneRuntimeState(repoRoot, {
  maxAgeMs: Math.max(1, Number(process.env.RUNTIME_STATE_MAX_AGE_HOURS || '24')) * 60 * 60 * 1000,
});

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
  });
}

function restartIfRepoCodeChanged() {
  return maybeRestartForUpdatedSource({
    repoRoot,
    bootGitHead,
    spawnArgs: process.argv.slice(1),
    reasonLabel: 'attachment-worker',
    beforeExit: () => workerLock.release(),
  });
}

async function tick() {
  const startedAt = new Date().toISOString();
  const results = await runAttachmentWorkerOnce();
  console.log(JSON.stringify({ startedAt, processed: results.length, results }, null, 2));
}

async function main() {
  do {
    if (restartIfRepoCodeChanged()) return;
    await tick();
    if (runOnce || stopping) break;
    if (restartIfRepoCodeChanged()) return;
    await delay(pollSeconds * 1000);
  } while (!stopping);
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    workerLock.release();
  });

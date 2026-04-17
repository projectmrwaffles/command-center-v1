import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import runtimeHardening from './runtime-hardening.js';

const {
  acquireProcessLock,
  createScratchScope,
  pruneRuntimeState,
  readGitHead,
  resolveRuntimeSubdir,
} = runtimeHardening;

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ccv1-runtime-hardening-'));
const lockDir = resolveRuntimeSubdir(repoRoot, 'locks');

const staleLockPath = path.join(lockDir, 'verify-runtime-hardening.lock');
fs.writeFileSync(staleLockPath, '999999');
const lock = acquireProcessLock(lockDir, 'verify-runtime-hardening');
assert.equal(lock.staleCleared, true);
lock.release();
assert.equal(fs.existsSync(staleLockPath), false);

const scratch = createScratchScope(repoRoot, 'verify-runtime', 'job-a');
fs.writeFileSync(path.join(scratch.dir, 'marker.txt'), 'ok');
assert.equal(fs.existsSync(scratch.dir), true);
scratch.cleanup();
assert.equal(fs.existsSync(scratch.dir), false);

const staleScratchRoot = resolveRuntimeSubdir(repoRoot, 'scratch');
const staleRunLogRoot = resolveRuntimeSubdir(repoRoot, 'run-logs');
const oldScratch = path.join(staleScratchRoot, 'verify-old-scratch');
const oldRunLog = path.join(staleRunLogRoot, 'verify-old-run-log.json');
fs.mkdirSync(oldScratch, { recursive: true });
fs.writeFileSync(oldRunLog, '{}');
const oldTime = new Date('2020-01-01T00:00:00.000Z');
fs.utimesSync(oldScratch, oldTime, oldTime);
fs.utimesSync(oldRunLog, oldTime, oldTime);
const pruned = pruneRuntimeState(repoRoot, { maxAgeMs: 1000, now: Date.now() });
assert.ok(pruned.removedScratch.some((entry) => entry.endsWith('verify-old-scratch')));
assert.ok(pruned.removedRunLogs.some((entry) => entry.endsWith('verify-old-run-log.json')));

spawnSync('git', ['init'], { cwd: tempRepo, stdio: 'ignore' });
spawnSync('git', ['config', 'user.email', 'verify@example.com'], { cwd: tempRepo, stdio: 'ignore' });
spawnSync('git', ['config', 'user.name', 'Verify'], { cwd: tempRepo, stdio: 'ignore' });
fs.writeFileSync(path.join(tempRepo, 'README.md'), '# temp\n');
spawnSync('git', ['add', 'README.md'], { cwd: tempRepo, stdio: 'ignore' });
spawnSync('git', ['commit', '-m', 'init'], { cwd: tempRepo, stdio: 'ignore' });
const head = readGitHead(tempRepo);
assert.match(head || '', /^[0-9a-f]{40}$/i);

fs.rmSync(tempRepo, { recursive: true, force: true });
console.log('PASS runtime hardening handles stale locks, scratch cleanup, runtime pruning, and git HEAD detection');

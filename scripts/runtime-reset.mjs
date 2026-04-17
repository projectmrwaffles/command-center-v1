import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import runtimeHardening from './runtime-hardening.js';

const { pruneRuntimeState } = runtimeHardening;
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const includeLaunchd = args.has('--restart-attachment-worker');
const maxAgeHours = Math.max(0, Number(process.env.RUNTIME_STATE_MAX_AGE_HOURS || '0'));

const result = pruneRuntimeState(repoRoot, {
  maxAgeMs: maxAgeHours > 0 ? maxAgeHours * 60 * 60 * 1000 : 0,
});

const attachmentPlist = path.join(os.homedir(), 'Library/LaunchAgents/com.command-center.attachment-worker.plist');
let launchd = { restarted: false, skipped: true };
if (includeLaunchd && fs.existsSync(attachmentPlist)) {
  spawnSync('launchctl', ['unload', attachmentPlist], { stdio: 'ignore' });
  const load = spawnSync('launchctl', ['load', attachmentPlist], { encoding: 'utf8' });
  const kickstart = spawnSync('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/com.command-center.attachment-worker`], { encoding: 'utf8' });
  launchd = {
    restarted: load.status === 0 && kickstart.status === 0,
    skipped: false,
    loadStatus: load.status,
    kickstartStatus: kickstart.status,
    loadStderr: String(load.stderr || '').trim() || null,
    kickstartStderr: String(kickstart.stderr || '').trim() || null,
  };
}

console.log(JSON.stringify({
  runtimeRoot: result.runtimeRoot,
  removedScratch: result.removedScratch,
  removedRunLogs: result.removedRunLogs,
  removedLocks: result.removedLocks,
  launchd,
}, null, 2));

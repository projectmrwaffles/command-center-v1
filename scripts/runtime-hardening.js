const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function readGitHead(repoRoot) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 5000,
  });
  if (result.status !== 0) return null;
  const value = String(result.stdout || '').trim();
  return value || null;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function resolveRuntimeRoot(repoRoot) {
  return ensureDir(path.join(repoRoot, '.ops-runtime'));
}

function resolveRuntimeSubdir(repoRoot, name) {
  return ensureDir(path.join(resolveRuntimeRoot(repoRoot), name));
}

function pruneOldEntries(dirPath, maxAgeMs, now = Date.now()) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  const removed = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const targetPath = path.join(dirPath, entry.name);
    let stat;
    try {
      stat = fs.statSync(targetPath);
    } catch {
      continue;
    }
    if ((now - stat.mtimeMs) < maxAgeMs) continue;
    fs.rmSync(targetPath, { recursive: true, force: true });
    removed.push(targetPath);
  }
  return removed;
}

function createScratchScope(repoRoot, scope, jobKey) {
  const scratchRoot = resolveRuntimeSubdir(repoRoot, 'scratch');
  const safeScope = String(scope || 'runtime').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const safeJobKey = String(jobKey || 'job').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const dir = fs.mkdtempSync(path.join(scratchRoot, `${safeScope}-${safeJobKey}-`));
  let cleaned = false;
  return {
    dir,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function pidIsAlive(pid) {
  const parsed = Number.parseInt(String(pid || ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return false;
  try {
    process.kill(parsed, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireProcessLock(lockDir, lockName) {
  ensureDir(lockDir);
  const lockPath = path.join(lockDir, `${lockName}.lock`);

  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      let released = false;
      return {
        lockPath,
        staleCleared: false,
        release() {
          if (released) return;
          released = true;
          try { fs.closeSync(fd); } catch {}
          try { fs.unlinkSync(lockPath); } catch {}
        },
      };
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
      const ownerPid = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8').trim() : '';
      if (pidIsAlive(ownerPid)) {
        throw new Error(`Lock already held for ${lockName} (pid ${ownerPid || 'unknown'})`);
      }
      fs.rmSync(lockPath, { force: true });
      return {
        ...acquireProcessLock(lockDir, lockName),
        staleCleared: true,
      };
    }
  }
}

function maybeRestartForUpdatedSource(input) {
  const { repoRoot, bootGitHead, spawnArgs, reasonLabel, beforeExit } = input;
  if (!bootGitHead) return false;
  const currentHead = readGitHead(repoRoot);
  if (!currentHead || currentHead === bootGitHead) return false;
  console.log(`[${reasonLabel}] Restarting after repo HEAD changed from ${bootGitHead.slice(0, 7)} to ${currentHead.slice(0, 7)}`);
  try {
    beforeExit?.();
  } catch (error) {
    console.warn(`[${reasonLabel}] Cleanup before restart failed:`, error?.message || error);
  }
  const child = require('child_process').spawn(process.execPath, spawnArgs, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    detached: true,
  });
  child.unref();
  process.exit(0);
}

function pruneRuntimeState(repoRoot, options = {}) {
  const runtimeRoot = resolveRuntimeRoot(repoRoot);
  const scratchRoot = resolveRuntimeSubdir(repoRoot, 'scratch');
  const runLogRoot = resolveRuntimeSubdir(repoRoot, 'run-logs');
  const lockRoot = resolveRuntimeSubdir(repoRoot, 'locks');
  const maxAgeMs = options.maxAgeMs || 24 * 60 * 60 * 1000;
  const removedScratch = pruneOldEntries(scratchRoot, maxAgeMs, options.now);
  const removedRunLogs = pruneOldEntries(runLogRoot, maxAgeMs, options.now);
  const removedLocks = [];

  for (const entry of fs.readdirSync(lockRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const lockPath = path.join(lockRoot, entry.name);
    const pid = fs.readFileSync(lockPath, 'utf8').trim();
    if (pidIsAlive(pid)) continue;
    fs.rmSync(lockPath, { force: true });
    removedLocks.push(lockPath);
  }

  return { runtimeRoot, scratchRoot, runLogRoot, lockRoot, removedScratch, removedRunLogs, removedLocks };
}

module.exports = {
  acquireProcessLock,
  createScratchScope,
  maybeRestartForUpdatedSource,
  pruneOldEntries,
  pruneRuntimeState,
  readGitHead,
  resolveRuntimeRoot,
  resolveRuntimeSubdir,
};

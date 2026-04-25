#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { rememberProcessedTask, releaseProcessedTask } = require("./agent-listener.js");

const processedTasks = new Set();
const taskId = "task-retryable";

rememberProcessedTask(processedTasks, taskId);
assert.equal(processedTasks.has(taskId), true, "task should be tracked while queued/running");

releaseProcessedTask(processedTasks, taskId);
assert.equal(processedTasks.has(taskId), false, "task should be releasable after a run finishes");

rememberProcessedTask(processedTasks, taskId);
assert.equal(processedTasks.has(taskId), true, "same task id should be reusable after release");

const rollingWindow = new Set();
for (let i = 0; i < 101; i += 1) {
  rememberProcessedTask(rollingWindow, `task-${i}`);
}
assert.equal(rollingWindow.size, 51, "processed task trimming should retain the newest half-window plus current task");
assert.equal(rollingWindow.has("task-0"), false, "oldest processed task should be trimmed");
assert.equal(rollingWindow.has("task-50"), true, "newer processed tasks should remain after trimming");
assert.equal(rollingWindow.has("task-100"), true, "latest processed task should remain after trimming");

console.log("verify-agent-listener-processed-tasks: ok");

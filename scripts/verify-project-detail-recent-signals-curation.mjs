import assert from "node:assert/strict";
import { resolveProjectDetailRecentUpdates } from "../src/lib/project-detail-truth.ts";

const updates = resolveProjectDetailRecentUpdates({
  recentSignals: [
    {
      id: "queued-job",
      kind: "progress",
      title: "Queued job",
      detail: "A dispatched job is queued for agent pickup",
      timestamp: "2026-04-24T18:00:00.000Z",
    },
    {
      id: "approval-1",
      kind: "approval",
      title: "Homepage copy approval requested",
      detail: "Creative approval is waiting",
      timestamp: "2026-04-24T17:00:00.000Z",
    },
    {
      id: "completed-1",
      kind: "completed",
      title: "Checkout QA completed",
      detail: "Validation pass finished with a clean result",
      timestamp: "2026-04-24T16:00:00.000Z",
    },
  ],
  extraUpdates: [
    {
      id: "review-1",
      kind: "review",
      title: "Launch prep needs review follow-through",
      detail: "Changes requested requires follow-through.",
      timestamp: "2026-04-24T19:00:00.000Z",
    },
    {
      id: "review-2-duplicate",
      kind: "review",
      title: "Launch prep review follow-through",
      detail: "Changes requested requires follow-through.",
      timestamp: "2026-04-24T18:30:00.000Z",
    },
    {
      id: "blocked-1",
      kind: "blocked",
      title: "Build stage blocked",
      detail: "Add a real GitHub repo to this project before this checkpoint can be approved.",
      timestamp: "2026-04-24T20:00:00.000Z",
    },
  ],
});

assert.equal(updates.length, 4, "Expected curated feed to remove low-signal and duplicate items");
assert.deepEqual(
  updates.map((update) => update.kind),
  ["blocked", "review", "approval", "completed"],
  "Expected operator-relevant kinds in priority order",
);
assert.ok(!updates.some((update) => /queued job/i.test(`${update.title} ${update.detail}`)), "Queued job noise should be filtered out");
assert.equal(
  updates.filter((update) => update.kind === "review").length,
  1,
  "Overlapping review updates should collapse into one curated item",
);

console.log("verify-project-detail-recent-signals-curation: ok", JSON.stringify({
  count: updates.length,
  kinds: updates.map((update) => update.kind),
  titles: updates.map((update) => update.title),
}, null, 2));

import assert from "node:assert/strict";

const PROJECT_LINK_FIELDS = ["github", "preview", "production", "docs", "figma", "admin"];

function normalizeUrl(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeProjectLinks(input) {
  if (!input || typeof input !== "object") return null;
  const output = {};
  for (const key of PROJECT_LINK_FIELDS) {
    const value = input[key];
    if (typeof value !== "string") continue;
    const normalized = normalizeUrl(value);
    if (normalized) output[key] = normalized;
  }
  return Object.keys(output).length > 0 ? output : null;
}

function mergeProjectLinks(existing, incoming) {
  const base = sanitizeProjectLinks(existing) || {};
  const next = sanitizeProjectLinks(incoming) || {};
  const merged = { ...base, ...next };
  return Object.keys(merged).length > 0 ? merged : null;
}

function buildReviewRequestSummary({ projectName, sprintName }) {
  return `Review ${sprintName} for ${projectName}`;
}

function buildReviewRequestContext(input) {
  return {
    kind: "project_phase_review",
    sprint_id: input.sprintId,
    sprint_name: input.sprintName,
    project_id: input.projectId,
    project_name: input.projectName,
    links: input.links,
    note: input.note,
  };
}

const merged = mergeProjectLinks(
  { docs: "docs.example.com/spec", github: "https://github.com/acme/old" },
  { github: "github.com/acme/new", preview: "preview.example.com/review" },
);
assert.deepEqual(merged, {
  docs: "https://docs.example.com/spec",
  github: "https://github.com/acme/new",
  preview: "https://preview.example.com/review",
});

const summary = buildReviewRequestSummary({ projectName: "Command Center", sprintName: "Phase 2 · Build" });
assert.equal(summary, "Review Phase 2 · Build for Command Center");

const context = buildReviewRequestContext({
  sprintId: "s1",
  sprintName: "Phase 2 · Build",
  projectId: "p1",
  projectName: "Command Center",
  links: merged,
  note: "Ready for QC with GitHub + preview attached.",
});
assert.equal(context.kind, "project_phase_review");
assert.equal(context.sprint_id, "s1");
assert.equal(context.links?.github, "https://github.com/acme/new");
assert.equal(context.note, "Ready for QC with GitHub + preview attached.");

console.log("verify-review-request-flow: ok");

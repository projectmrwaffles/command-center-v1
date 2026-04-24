import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getGroupedProjectLinks, getWorkingProjectLinkCount } from "@/lib/project-detail-context";

const repoRoot = process.cwd();
const pagePath = path.join(repoRoot, "src/app/projects/[id]/page.tsx");
const pageSource = fs.readFileSync(pagePath, "utf8");

const sampleLinks = {
  github: "https://github.com/acme/command-center",
  preview: "https://preview.acme.dev",
  production: "https://app.acme.dev",
  admin: "https://admin.acme.dev",
  docs: "https://docs.google.com/document/d/123",
  figma: "https://www.figma.com/file/123",
};

const groupedLinks = getGroupedProjectLinks(sampleLinks);
const workingGroup = groupedLinks.find((group) => group.id === "working");
const referenceGroup = groupedLinks.find((group) => group.id === "reference");

assert.ok(workingGroup, "Expected Working links group to exist");
assert.ok(referenceGroup, "Expected Reference links group to exist");
assert.equal(workingGroup.entries.length, 4, "Working links group should include github, preview, production, and admin only");
assert.equal(referenceGroup.entries.length, 2, "Reference links group should include docs and figma only");
assert.equal(getWorkingProjectLinkCount(sampleLinks), 4, "Working links summary count should exclude reference links");
assert.equal(getWorkingProjectLinkCount({ docs: sampleLinks.docs, figma: sampleLinks.figma }), 0, "Working links summary count should stay zero when only reference links exist");

assert.match(pageSource, /title="Recent signals"/, "Project detail page should render the Recent signals section for Slice 6");
assert.match(pageSource, /label: "Working links", value: getWorkingProjectLinkCount\(project\.links\)/, "Context summary card should use the working-links-only count helper");
assert.match(pageSource, /groupedProjectLinks\.map\(\(group\) => \(/, "Context links should still render grouped link cards");

console.log("verify-project-detail-truth-slice6: ok", JSON.stringify({
  workingLinkCount: getWorkingProjectLinkCount(sampleLinks),
  referenceLinkCount: referenceGroup.entries.length,
  verifiedPage: path.relative(repoRoot, pagePath),
}, null, 2));

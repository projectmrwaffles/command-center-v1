import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  deriveProjectRequirements,
  getProjectRequirementCompliance,
} from "../src/lib/project-requirements.ts";

function makeRepo(name, packageJson) {
  const repoRoot = path.join(os.homedir(), ".openclaw", "workspace-tech-lead-architect", "projects", name);
  fs.rmSync(repoRoot, { recursive: true, force: true });
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "package.json"), JSON.stringify(packageJson, null, 2));
  return repoRoot;
}

const reactNativeOnly = deriveProjectRequirements({
  intakeSummary: "Build a mobile app with React Native.",
  intakeGoals: "Use React Native for the app shell.",
});

const reactNativeRequirement = reactNativeOnly.technologyRequirements.find((requirement) => requirement.kind === "framework");
assert(reactNativeRequirement, "expected a framework requirement for React Native");
assert.deepEqual(
  reactNativeRequirement.choices.map((choice) => choice.slug).sort(),
  ["react-native"],
  "React Native parsing should not overmatch plain React",
);

makeRepo("prd-contract-forbidden-supabase-runtime", {
  name: "prd-contract-forbidden-supabase-runtime",
  private: true,
  engines: { node: ">=20" },
  dependencies: {
    "@supabase/supabase-js": "^2.0.0",
  },
  devDependencies: {
    pg: "^8.0.0",
    "shadcn-ui": "^1.0.0",
  },
});

const forbiddenRequirements = deriveProjectRequirements({
  intakeSummary: "Do not use Supabase, Node.js runtime, PostgreSQL, or shadcn/ui.",
  intakeGoals: "Avoid those technologies in this implementation.",
});

const compliance = getProjectRequirementCompliance({
  links: { github: "https://github.com/acme/prd-contract-forbidden-supabase-runtime" },
  intake: { requirements: forbiddenRequirements },
});

assert(compliance.detectedBackends.includes("supabase"), "repo inspection should detect Supabase as backend");
assert(compliance.detectedRuntimes.includes("nodejs"), "repo inspection should detect Node.js runtime");
assert(compliance.detectedDatabases.includes("postgresql"), "repo inspection should detect PostgreSQL usage");
assert(compliance.detectedTooling.includes("shadcn-ui"), "repo inspection should detect shadcn/ui tooling");
assert(
  compliance.violations.some((violation) => violation.includes("supabase")),
  "forbidden backend requirement should produce a compliance violation",
);
assert(
  compliance.violations.some((violation) => violation.includes("nodejs")),
  "forbidden runtime requirement should produce a compliance violation",
);
assert(
  compliance.violations.some((violation) => violation.includes("postgresql")),
  "forbidden database requirement should produce a compliance violation",
);
assert(
  compliance.violations.some((violation) => violation.includes("shadcn-ui")),
  "forbidden tooling requirement should produce a compliance violation",
);

console.log("verify-prd-contract-core: ok");

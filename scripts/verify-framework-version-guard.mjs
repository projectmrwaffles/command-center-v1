import fs from "fs";
import os from "os";
import path from "path";
import assert from "assert/strict";
import { inspectRepoFrameworkVersionPolicy, formatFrameworkVersionViolations } from "./framework-version-guard.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc-framework-guard-"));
const blockedRepo = path.join(tempRoot, "blocked-repo");
const allowedRepo = path.join(tempRoot, "allowed-repo");

fs.mkdirSync(blockedRepo, { recursive: true });
fs.mkdirSync(allowedRepo, { recursive: true });

fs.writeFileSync(
  path.join(blockedRepo, "package.json"),
  JSON.stringify({
    dependencies: {
      next: "15.3.0",
      react: "19.2.3",
      "react-dom": "19.2.3"
    },
    devDependencies: {
      "eslint-config-next": "15.3.0"
    }
  }, null, 2)
);

fs.writeFileSync(
  path.join(allowedRepo, "package.json"),
  JSON.stringify({
    dependencies: {
      next: "15.5.15",
      react: "19.2.3",
      "react-dom": "19.2.3"
    },
    devDependencies: {
      "eslint-config-next": "15.5.15"
    }
  }, null, 2)
);

const blocked = inspectRepoFrameworkVersionPolicy(blockedRepo);
const allowed = inspectRepoFrameworkVersionPolicy(allowedRepo);

assert.equal(blocked.ok, false, "expected next@15.3.0 to be blocked");
assert(blocked.violations.some((violation) => violation.packageName === "next" && violation.version === "15.3.0"), "expected blocked policy to flag next@15.3.0");
assert(blocked.violations.some((violation) => violation.packageName === "eslint-config-next" && violation.version === "15.3.0"), "expected blocked policy to flag eslint-config-next@15.3.0");
assert.match(formatFrameworkVersionViolations(blocked.violations), /next@15\.3\.0/, "expected formatted violation output to mention next@15.3.0");
assert.equal(allowed.ok, true, "expected current seeded Next.js version to pass");

console.log("verify-framework-version-guard: ok");
console.log(`blocked violations: ${formatFrameworkVersionViolations(blocked.violations)}`);

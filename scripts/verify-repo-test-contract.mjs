import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { inspectRepoTestContract } = require("./agent-listener.js");

const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccv1-test-contract-"));

fs.mkdirSync(path.join(repoDir, "src", "test"), { recursive: true });
fs.writeFileSync(path.join(repoDir, "package.json"), JSON.stringify({
  name: "fixture-broken-test-contract",
  private: true,
  scripts: { test: "vitest --run" },
  dependencies: { react: "^18.2.0", "react-dom": "^18.2.0" },
  devDependencies: {
    vite: "^5.1.0",
    vitest: "^1.6.1",
    jsdom: "^24.0.0",
    "@testing-library/react": "^14.2.1",
    "@testing-library/jest-dom": "^6.4.2"
  }
}, null, 2));
fs.writeFileSync(path.join(repoDir, "src", "test", "setup.ts"), "import '@testing-library/jest-dom';\n");

const broken = inspectRepoTestContract(repoDir);
assert.equal(broken.hasBrokenTestContract, true);
assert.equal(broken.matches.length, 0);
assert.deepEqual(broken.declaredTooling.sort(), ["@testing-library/jest-dom", "@testing-library/react", "jsdom", "vite", "vitest"].sort());

fs.writeFileSync(path.join(repoDir, "src", "App.test.tsx"), "import { describe, expect, it } from 'vitest';\ndescribe('app', () => { it('works', () => expect(true).toBe(true)); });\n");

const healthy = inspectRepoTestContract(repoDir);
assert.equal(healthy.hasBrokenTestContract, false);
assert.equal(healthy.matches.length, 1);

fs.rmSync(repoDir, { recursive: true, force: true });
console.log("verify-repo-test-contract: ok");

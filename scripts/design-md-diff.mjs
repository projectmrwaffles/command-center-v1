#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const defaults = [
  "docs/design/_template/DESIGN.md",
  "docs/design/project-intake/DESIGN.md",
];
const args = process.argv.slice(2);
const cliArgs = args.length > 0 ? ["diff", ...args] : ["diff", ...defaults];
const cliPath = path.resolve(process.cwd(), "node_modules/.bin/design.md");

const result = spawnSync(cliPath, cliArgs, {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

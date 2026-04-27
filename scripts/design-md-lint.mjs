#!/usr/bin/env node
import { access } from "node:fs/promises";
import path from "node:path";

const targetArg = process.argv[2] || "docs/design";
const target = path.resolve(process.cwd(), targetArg);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const templatePath = path.resolve(process.cwd(), "docs/design/_template/DESIGN.md");
const hasTarget = await exists(target);
const hasTemplate = await exists(templatePath);

if (!hasTemplate) {
  console.error(`Missing design template: ${templatePath}`);
  process.exit(1);
}

if (!hasTarget) {
  console.error(`Design docs path not found: ${target}`);
  process.exit(1);
}

console.log("design-md lint placeholder");
console.log(`- target: ${target}`);
console.log(`- template: ${templatePath}`);
console.log("- status: repo foundation is ready for Google design.md tooling hookup");
console.log("- next: replace this placeholder with the upstream design.md linter/validator once the team chooses the installation path");

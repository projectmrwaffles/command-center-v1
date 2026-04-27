#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const [fromArg = "docs/design/_template/DESIGN.md", toArg = "docs/design/project-intake/DESIGN.md"] = process.argv.slice(2);
const fromPath = path.resolve(process.cwd(), fromArg);
const toPath = path.resolve(process.cwd(), toArg);

async function ensure(filePath) {
  try {
    await access(filePath);
  } catch {
    console.error(`Missing file: ${filePath}`);
    process.exit(1);
  }
}

await ensure(fromPath);
await ensure(toPath);

const [fromText, toText] = await Promise.all([
  readFile(fromPath, "utf8"),
  readFile(toPath, "utf8"),
]);

console.log("design-md diff placeholder");
console.log(`- baseline: ${fromPath}`);
console.log(`- candidate: ${toPath}`);
console.log(`- baseline lines: ${fromText.split("\n").length}`);
console.log(`- candidate lines: ${toText.split("\n").length}`);
console.log("- next: wire this script to the official Google design.md diff/review flow once the team adopts the upstream package or CLI");

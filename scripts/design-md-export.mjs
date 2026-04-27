#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceArg = process.argv[2] || "docs/design/project-intake/DESIGN.md";
const outArg = process.argv[3] || "docs/design/project-intake/DESIGN.export.md";
const sourcePath = path.resolve(process.cwd(), sourceArg);
const outPath = path.resolve(process.cwd(), outArg);

const source = await readFile(sourcePath, "utf8");
const rendered = [
  "<!-- design-md export placeholder -->",
  `<!-- source: ${sourceArg} -->`,
  "",
  source,
].join("\n");

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, rendered, "utf8");

console.log("design-md export placeholder");
console.log(`- source: ${sourcePath}`);
console.log(`- output: ${outPath}`);
console.log("- status: wrote a repo-local export artifact while upstream export tooling is still pending");

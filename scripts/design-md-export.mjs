#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const sourceArg = process.argv[2] || "docs/design/project-intake/DESIGN.md";
const formatArg = process.argv[3] || "dtcg";
const outArg = process.argv[4] || `docs/design/project-intake/DESIGN.${formatArg}.json`;
const cliPath = path.resolve(process.cwd(), "node_modules/.bin/design.md");

const result = spawnSync(cliPath, ["export", "--format", formatArg, sourceArg], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const outPath = path.resolve(process.cwd(), outArg);
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, result.stdout, "utf8");

console.log(JSON.stringify({
  source: path.resolve(process.cwd(), sourceArg),
  format: formatArg,
  output: outPath,
}, null, 2));

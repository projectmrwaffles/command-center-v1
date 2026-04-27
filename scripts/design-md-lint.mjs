#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const docsDesignRoot = path.resolve(process.cwd(), "docs/design");
const cliPath = path.resolve(process.cwd(), "node_modules/.bin/design.md");

async function findDesignDocs(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const docs = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      docs.push(...await findDesignDocs(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name === "DESIGN.md") {
      docs.push(path.relative(process.cwd(), fullPath));
    }
  }

  return docs.sort();
}

const args = process.argv.slice(2);
const targets = args.length > 0 ? args : await findDesignDocs(docsDesignRoot);

if (targets.length === 0) {
  console.error(`No DESIGN.md files found under ${path.relative(process.cwd(), docsDesignRoot)}`);
  process.exit(1);
}

console.log(`Linting ${targets.length} DESIGN.md file(s):`);
for (const target of targets) {
  console.log(`- ${target}`);
}

const result = spawnSync(cliPath, ["lint", ...targets], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

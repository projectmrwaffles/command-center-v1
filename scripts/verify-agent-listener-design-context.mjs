#!/usr/bin/env node
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { buildAgentMessage, resolveRepoDesignContext } = require("./agent-listener.js");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "listener-design-context-"));
const repoRoot = path.join(tempRoot, "workspace-tech-lead-architect", "projects", "acme-notes");
fs.mkdirSync(path.join(repoRoot, "docs", "design", "notes-vault"), { recursive: true });
fs.mkdirSync(path.join(repoRoot, "docs", "design", "_template"), { recursive: true });
fs.writeFileSync(path.join(repoRoot, "docs", "design", "notes-vault", "DESIGN.md"), `# Notes Vault Design\n\n- Use Supabase auth\n- Ship repo-backed implementation\n- Validate QA flows\n`);
fs.writeFileSync(path.join(repoRoot, "docs", "design", "_template", "DESIGN.md"), `# Template\n- Ignore me\n`);

process.env.OPENCLAW_ROOT = tempRoot;

const project = {
  name: "Acme Notes",
  type: "saas-product",
  intake: {
    shape: "saas-product",
    links: { github: "https://github.com/acme/acme-notes" },
  },
  links: { github: "https://github.com/acme/acme-notes" },
  github_repo_binding: { url: "https://github.com/acme/acme-notes" },
};

const context = resolveRepoDesignContext({
  repoWorkspacePath: repoRoot,
  projectName: project.name,
  taskTitle: "Implement Notes Vault flows",
  taskType: "build_implementation",
});

if (!context) throw new Error("Expected design context to resolve");
if (context.relativePath !== path.join("docs", "design", "notes-vault", "DESIGN.md")) {
  throw new Error(`Unexpected design path: ${context.relativePath}`);
}

const message = buildAgentMessage({
  project,
  taskTitle: "Implement Notes Vault flows",
  taskId: "task-123",
  projectId: "project-123",
  taskType: "build_implementation",
  taskMetadata: {},
});

if (!message.includes("Selected DESIGN.md context: docs/design/notes-vault/DESIGN.md")) {
  throw new Error("Prompt missing selected DESIGN.md path");
}
if (!message.includes("DESIGN context to follow:")) {
  throw new Error("Prompt missing DESIGN context block");
}
if (!message.includes("Use Supabase auth")) {
  throw new Error("Prompt missing DESIGN summary bullet");
}

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("verify-agent-listener-design-context: ok");

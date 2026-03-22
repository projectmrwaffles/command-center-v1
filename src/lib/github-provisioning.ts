import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { createGitHubRepoBinding, type GitHubRepoBinding } from "./github-repo-binding.ts";
import type { ProjectIntake } from "./project-intake.ts";

const execFile = promisify(execFileCb);

const CODE_HEAVY_PROJECT_TYPES = new Set(["product_build", "ops_enablement", "saas", "web_app", "native_app"]);
const CODE_HEAVY_SHAPES = new Set(["saas-product", "web-app", "native-app", "ops-system"]);
const CODE_HEAVY_CAPABILITIES = new Set(["frontend", "backend-data"]);

function slugifyRepoName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "project";
}

function isCodeHeavyProject(type: string, intake?: ProjectIntake | null) {
  return Boolean(
    CODE_HEAVY_PROJECT_TYPES.has(type) ||
      (intake?.shape && CODE_HEAVY_SHAPES.has(intake.shape)) ||
      (intake?.capabilities || []).some((capability) => CODE_HEAVY_CAPABILITIES.has(capability))
  );
}

export function shouldAutoProvisionGitHubRepo(input: {
  type: string;
  intake?: ProjectIntake | null;
  existingGitHubUrl?: string | null;
  provisionGithubRepo?: boolean;
}) {
  if (input.existingGitHubUrl) return false;
  if (input.provisionGithubRepo != null) return input.provisionGithubRepo;
  if (input.intake?.projectOrigin === "existing") return false;
  return isCodeHeavyProject(input.type, input.intake);
}

async function ghJson<T>(args: string[]): Promise<T> {
  const { stdout } = await execFile("gh", args, {
    env: { ...process.env, GH_PAGER: "cat" },
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout) as T;
}

async function gh(args: string[]) {
  return execFile("gh", args, {
    env: { ...process.env, GH_PAGER: "cat" },
    maxBuffer: 1024 * 1024,
  });
}

async function resolveProvisioningOwner() {
  const configuredOwner = process.env.GITHUB_PROVISIONING_OWNER?.trim();
  if (configuredOwner) return configuredOwner;

  const viewer = await ghJson<{ login: string }>(["api", "user"]);
  if (!viewer.login) throw new Error("Unable to resolve GitHub login for repo provisioning.");
  return viewer.login;
}

async function repoExists(fullName: string) {
  try {
    await gh(["repo", "view", fullName, "--json", "nameWithOwner"]);
    return true;
  } catch {
    return false;
  }
}

async function chooseRepoName(owner: string, projectName: string, projectId: string) {
  const base = slugifyRepoName(projectName);
  const suffix = projectId.replace(/-/g, "").slice(0, 6).toLowerCase();
  const candidates = [`${base}-${suffix}`, base, `${base}-app`, `${base}-workspace`];

  for (const candidate of candidates) {
    if (!(await repoExists(`${owner}/${candidate}`))) {
      return candidate;
    }
  }

  return `${base}-${Date.now().toString(36)}`;
}

export async function provisionGitHubRepoForProject(input: {
  projectId: string;
  projectName: string;
  description?: string | null;
}) : Promise<GitHubRepoBinding> {
  const owner = await resolveProvisioningOwner();
  const repo = await chooseRepoName(owner, input.projectName, input.projectId);
  const fullName = `${owner}/${repo}`;

  const description = (input.description || `Auto-provisioned project workspace for ${input.projectName}`).slice(0, 200);

  await gh([
    "repo",
    "create",
    fullName,
    "--private",
    "--add-readme",
    "--description",
    description,
  ]);

  const repoData = await ghJson<{ html_url: string; default_branch?: string | null }>([
    "api",
    `repos/${fullName}`,
  ]);

  const binding = createGitHubRepoBinding({
    url: repoData.html_url,
    source: "provisioned",
    defaultBranch: repoData.default_branch || "main",
    provisioning: {
      status: "ready",
      reason: "GitHub repository provisioned automatically during project submission.",
    },
  });

  if (!binding) {
    throw new Error(`Provisioned GitHub repo could not be parsed: ${repoData.html_url}`);
  }

  return binding;
}

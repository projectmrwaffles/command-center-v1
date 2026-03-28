import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { promisify } from "node:util";
import { delimiter } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { createGitHubRepoBinding, type GitHubRepoBinding } from "./github-repo-binding.ts";
import type { ProjectIntake } from "./project-intake.ts";

const execFile = promisify(execFileCb);

const CODE_HEAVY_PROJECT_TYPES = new Set(["product_build", "ops_enablement", "saas", "web_app", "native_app"]);
const CODE_HEAVY_SHAPES = new Set(["saas-product", "web-app", "native-app", "ops-system"]);
const CODE_HEAVY_CAPABILITIES = new Set(["frontend", "backend-data"]);
const FALLBACK_GH_PATHS = [
  "/opt/homebrew/bin/gh",
  "/usr/local/bin/gh",
  "/usr/bin/gh",
  "/bin/gh",
];
const DEFAULT_PATH_SEGMENTS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
];

type ExecFileError = NodeJS.ErrnoException & {
  stderr?: string;
  stdout?: string;
  code?: string | number;
};

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

function getProvisioningEnv() {
  const defaultPathSegments = process.env.OPENCLAW_DISABLE_GH_PATH_AUGMENTATION === "1" ? [] : DEFAULT_PATH_SEGMENTS;
  const pathSegments = new Set(
    [
      ...(process.env.PATH ? process.env.PATH.split(delimiter) : []),
      ...defaultPathSegments,
    ].filter(Boolean)
  );

  return {
    ...process.env,
    GH_PAGER: "cat",
    PATH: Array.from(pathSegments).join(delimiter),
  };
}

async function canExecute(path: string) {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveGhExecutable() {
  const configured = [process.env.GITHUB_CLI_PATH, process.env.GH_PATH].map((value) => value?.trim()).filter(Boolean) as string[];
  const fallbackPaths = process.env.OPENCLAW_DISABLE_GH_FALLBACK === "1" ? [] : FALLBACK_GH_PATHS;
  for (const candidate of [...configured, ...fallbackPaths]) {
    if (await canExecute(candidate)) return candidate;
  }
  return "gh";
}

function extractGitHubCliErrorText(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const execError = error as ExecFileError;
  const pieces = [execError.stderr, execError.stdout]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  return pieces.length > 0 ? pieces.join(" ") : null;
}

function classifyGitHubProvisioningError(error: unknown) {
  const execError = error as ExecFileError | undefined;
  const code = typeof execError?.code === "string" ? execError.code : undefined;
  const details = extractGitHubCliErrorText(error);
  const lowerDetails = details?.toLowerCase() || "";

  if (code === "ENOENT") {
    return new Error(
      "GitHub repo auto-provisioning is unavailable in this runtime because the GitHub CLI could not be found. Install gh for the app runtime or set GITHUB_CLI_PATH, or attach an existing GitHub repo manually."
    );
  }

  if (
    lowerDetails.includes("not logged into any github hosts") ||
    lowerDetails.includes("authentication failed") ||
    lowerDetails.includes("gh auth login") ||
    lowerDetails.includes("could not resolve to a user")
  ) {
    return new Error(
      "GitHub repo auto-provisioning is configured, but GitHub CLI authentication is missing for this runtime. Run `gh auth login` (or provide a valid GH_TOKEN/GITHUB_TOKEN) for the server runtime, then retry provisioning or attach an existing repo manually."
    );
  }

  if (details) {
    return new Error(`GitHub repo auto-provisioning failed: ${details}`);
  }

  if (error instanceof Error && error.message) {
    return new Error(`GitHub repo auto-provisioning failed: ${error.message}`);
  }

  return new Error("GitHub repo auto-provisioning failed for an unknown runtime reason.");
}

async function execGh(args: string[]) {
  const ghExecutable = await resolveGhExecutable();

  try {
    return await execFile(ghExecutable, args, {
      env: getProvisioningEnv(),
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    throw classifyGitHubProvisioningError(error);
  }
}

export async function verifyGitHubCliRuntime() {
  const ghExecutable = await resolveGhExecutable();
  const version = await execGh(["--version"]);
  return {
    executable: ghExecutable,
    version: version.stdout.trim(),
  };
}

async function ghJson<T>(args: string[]): Promise<T> {
  const { stdout } = await execGh(args);
  return JSON.parse(stdout) as T;
}

async function gh(args: string[]) {
  return execGh(args);
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

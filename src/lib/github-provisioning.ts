import { createGitHubRepoBinding, type GitHubRepoBinding } from "./github-repo-binding.ts";
import type { ProjectIntake } from "./project-intake.ts";
import type { ProjectRequirements } from "./project-requirements.types.ts";

const CODE_HEAVY_PROJECT_TYPES = new Set(["product_build", "ops_enablement", "saas", "web_app", "native_app"]);
const CODE_HEAVY_SHAPES = new Set(["saas-product", "web-app", "native-app", "ops-system"]);
const CODE_HEAVY_CAPABILITIES = new Set(["frontend", "backend-data"]);
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

type GitHubApiRepo = {
  html_url: string;
  default_branch?: string | null;
};

type GitHubApiUser = {
  login: string;
  type?: string;
};

type RepoSeedFile = {
  path: string;
  content: string;
  message: string;
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

export function getGitHubToken() {
  return process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || null;
}

export function getGitHubProvisioningReadiness(input: {
  type: string;
  intake?: ProjectIntake | null;
  existingGitHubUrl?: string | null;
  provisionGithubRepo?: boolean;
}) {
  const requiresProvisioning = shouldAutoProvisionGitHubRepo(input);
  const token = getGitHubToken();

  if (!requiresProvisioning) {
    return {
      ok: true,
      requiresProvisioning,
      authConfigured: Boolean(token),
      code: null,
      error: null,
      nextAction: null,
    } as const;
  }

  if (!token) {
    return {
      ok: false,
      requiresProvisioning,
      authConfigured: false,
      code: "GITHUB_PROVISIONING_AUTH_MISSING",
      error:
        "This project needs a new GitHub repo before creation can continue, but GitHub provisioning auth is missing in the current server runtime.",
      nextAction:
        "Set GITHUB_TOKEN (preferred) or GH_TOKEN for the server runtime with repo creation access, then retry. If you meant to use an existing repo, switch the project origin to existing and link that repo explicitly.",
    } as const;
  }

  return {
    ok: true,
    requiresProvisioning,
    authConfigured: true,
    code: null,
    error: null,
    nextAction: null,
  } as const;
}

function getGitHubHeaders() {
  const token = getGitHubToken();
  if (!token) {
    throw new Error(
      "GitHub repo auto-provisioning is configured, but GitHub API authentication is missing for this runtime. Set GITHUB_TOKEN (preferred) or GH_TOKEN for the server runtime, then retry provisioning or attach an existing GitHub repo manually."
    );
  }

  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "command-center-v1-github-provisioning",
    "Content-Type": "application/json",
  };
}

async function githubRequest<T>(path: string, init?: RequestInit & { allow404?: boolean }): Promise<T | null> {
  const { allow404, ...requestInit } = init || {};
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...requestInit,
    headers: {
      ...getGitHubHeaders(),
      ...(requestInit.headers || {}),
    },
    cache: "no-store",
  });

  if (allow404 && response.status === 404) return null;

  if (!response.ok) {
    let details = `${response.status} ${response.statusText}`.trim();
    try {
      const body = await response.json() as { message?: string; errors?: Array<{ message?: string }> };
      const errorMessages = (body.errors || []).map((item) => item?.message).filter(Boolean);
      details = [body.message, ...errorMessages].filter(Boolean).join(" ") || details;
    } catch {
      const text = await response.text().catch(() => "");
      details = text.trim() || details;
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `GitHub repo auto-provisioning is configured, but GitHub API authentication failed for this runtime. Verify GITHUB_TOKEN/GH_TOKEN has repo creation access for the target owner. GitHub said: ${details}`
      );
    }

    throw new Error(`GitHub repo auto-provisioning failed: ${details}`);
  }

  if (response.status === 204) return null;
  return await response.json() as T;
}

export async function verifyGitHubCliRuntime() {
  const viewer = await githubRequest<GitHubApiUser>("/user");
  return {
    executable: "github-rest-api",
    version: `authenticated as ${viewer?.login || "unknown"}`,
  };
}

async function resolveProvisioningOwner() {
  const configuredOwner = process.env.GITHUB_PROVISIONING_OWNER?.trim();
  if (configuredOwner) return configuredOwner;

  const viewer = await githubRequest<GitHubApiUser>("/user");
  if (!viewer?.login) throw new Error("Unable to resolve GitHub login for repo provisioning.");
  return viewer.login;
}

async function resolveOwnerType(owner: string) {
  const ownerRecord = await githubRequest<GitHubApiUser>(`/users/${encodeURIComponent(owner)}`);
  return ownerRecord?.type === "Organization" ? "org" : "user";
}

async function repoExists(fullName: string) {
  const repo = await githubRequest<GitHubApiRepo>(`/repos/${fullName}`, { allow404: true });
  return Boolean(repo?.html_url);
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

function buildNextJsRepoSeed(projectName: string): RepoSeedFile[] {
  const packageJson = {
    name: slugifyRepoName(projectName),
    private: true,
    version: "0.1.0",
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      next: "15.3.0",
      react: "19.0.0",
      "react-dom": "19.0.0",
    },
    devDependencies: {
      typescript: "^5.8.3",
      "@types/node": "^22.14.1",
      "@types/react": "^19.0.10",
      "@types/react-dom": "^19.0.4",
      eslint: "^9.24.0",
      "eslint-config-next": "15.3.0",
    },
  };

  return [
    {
      path: "package.json",
      message: "chore: seed required Next.js scaffold",
      content: `${JSON.stringify(packageJson, null, 2)}\n`,
    },
    {
      path: "tsconfig.json",
      message: "chore: seed required Next.js scaffold",
      content: `${JSON.stringify({
        compilerOptions: {
          target: "ES2017",
          lib: ["dom", "dom.iterable", "esnext"],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: "preserve",
          incremental: true,
          plugins: [{ name: "next" }],
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
      }, null, 2)}\n`,
    },
    {
      path: "next-env.d.ts",
      message: "chore: seed required Next.js scaffold",
      content: "/// <reference types=\"next\" />\n/// <reference types=\"next/image-types/global\" />\n\n// NOTE: This file should not be edited\n",
    },
    {
      path: "app/page.tsx",
      message: "chore: seed required Next.js scaffold",
      content: `export default function HomePage() {\n  return (\n    <main style={{ padding: 24, fontFamily: \"Inter, Arial, sans-serif\" }}>\n      <h1>${projectName}</h1>\n      <p>Next.js scaffold provisioned automatically to satisfy the project stack contract.</p>\n    </main>\n  );\n}\n`,
    },
    {
      path: "README.md",
      message: "chore: seed required Next.js scaffold",
      content: `# ${projectName}\n\nThis repository was provisioned with a minimal Next.js scaffold because the project requirements explicitly require Next.js.\n`,
    },
    {
      path: ".gitignore",
      message: "chore: seed required Next.js scaffold",
      content: "node_modules\n.next\nout\n.env\n.env.local\n.DS_Store\n",
    },
  ];
}

export function deriveRepoSeedFiles(input: { projectName: string; requirements?: ProjectRequirements | null }) {
  const requiredFrameworks = (input.requirements?.requiredFrameworks || []).map((value) => String(value).toLowerCase());
  if (requiredFrameworks.includes("nextjs")) {
    return buildNextJsRepoSeed(input.projectName);
  }
  return [] as RepoSeedFile[];
}

async function seedProvisionedRepo(input: { owner: string; repo: string; branch: string; files: RepoSeedFile[] }) {
  for (const file of input.files) {
    await githubRequest(`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "PUT",
      body: JSON.stringify({
        message: file.message,
        content: Buffer.from(file.content, "utf8").toString("base64"),
        branch: input.branch,
      }),
    });
  }
}

export async function provisionGitHubRepoForProject(input: {
  projectId: string;
  projectName: string;
  description?: string | null;
  requirements?: ProjectRequirements | null;
}) : Promise<GitHubRepoBinding> {
  const owner = await resolveProvisioningOwner();
  const ownerType = await resolveOwnerType(owner);
  const repo = await chooseRepoName(owner, input.projectName, input.projectId);
  const fullName = `${owner}/${repo}`;
  const description = (input.description || `Auto-provisioned project workspace for ${input.projectName}`).slice(0, 200);

  const createPath = ownerType === "org"
    ? `/orgs/${encodeURIComponent(owner)}/repos`
    : "/user/repos";

  const createdRepo = await githubRequest<GitHubApiRepo>(createPath, {
    method: "POST",
    body: JSON.stringify({
      name: repo,
      private: true,
      auto_init: true,
      description,
    }),
  });

  const seedFiles = deriveRepoSeedFiles({ projectName: input.projectName, requirements: input.requirements });
  if (seedFiles.length) {
    await seedProvisionedRepo({ owner, repo, branch: createdRepo?.default_branch || "main", files: seedFiles });
  }

  const binding = createGitHubRepoBinding({
    url: createdRepo?.html_url,
    source: "provisioned",
    defaultBranch: createdRepo?.default_branch || "main",
    provisioning: {
      status: "ready",
      reason: "GitHub repository provisioned automatically during project submission.",
    },
  });

  if (!binding) {
    throw new Error(`Provisioned GitHub repo could not be parsed: ${createdRepo?.html_url || fullName}`);
  }

  return binding;
}

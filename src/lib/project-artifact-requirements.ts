import { parseGitHubRepoUrl, type GitHubRepoBinding } from "./github-repo-binding.ts";
import { normalizeUrl, type ProjectLinks } from "./project-links.ts";

const CODE_HEAVY_PROJECT_TYPES = new Set(["product_build", "ops_enablement", "saas", "web_app", "native_app"]);
const CODE_HEAVY_SHAPES = new Set(["saas-product", "web-app", "native-app", "ops-system"]);
const CODE_HEAVY_CAPABILITIES = new Set(["frontend", "backend-data"]);
const CODE_HEAVY_TASK_TYPES = new Set(["build_implementation"]);

export type ArtifactIntegrityTaskLike = {
  task_type?: string | null;
};

export type ArtifactIntegrityProjectLike = {
  type?: string | null;
  intake?: {
    shape?: string | null;
    capabilities?: string[] | null;
  } | null;
  links?: ProjectLinks | null;
  github_repo_binding?: GitHubRepoBinding | null;
};

export type ProjectArtifactIntegrity = {
  isCodeHeavy: boolean;
  requiresGitHubRepo: boolean;
  hasGitHubRepo: boolean;
  githubRepoUrl: string | null;
  blockingReason: string | null;
  completionBlocked: boolean;
  completionCapPct: number | null;
};

function hasCodeHeavyCapabilities(capabilities?: string[] | null) {
  return (capabilities || []).some((capability) => CODE_HEAVY_CAPABILITIES.has(capability));
}

function hasCodeHeavyTask(tasks?: ArtifactIntegrityTaskLike[] | null) {
  return (tasks || []).some((task) => task?.task_type && CODE_HEAVY_TASK_TYPES.has(task.task_type));
}

function resolveGitHubRepoUrl(project: ArtifactIntegrityProjectLike) {
  const bindingUrl = project.github_repo_binding?.url;
  if (bindingUrl && parseGitHubRepoUrl(bindingUrl)) {
    return parseGitHubRepoUrl(bindingUrl)?.url || null;
  }

  const rawLink = project.links?.github;
  const normalizedLink = normalizeUrl(rawLink);
  if (!normalizedLink) return null;

  return parseGitHubRepoUrl(normalizedLink)?.url || null;
}

export function getProjectArtifactIntegrity(project: ArtifactIntegrityProjectLike, tasks?: ArtifactIntegrityTaskLike[] | null): ProjectArtifactIntegrity {
  const isCodeHeavy = Boolean(
    (project.type && CODE_HEAVY_PROJECT_TYPES.has(project.type)) ||
    (project.intake?.shape && CODE_HEAVY_SHAPES.has(project.intake.shape)) ||
    hasCodeHeavyCapabilities(project.intake?.capabilities) ||
    hasCodeHeavyTask(tasks)
  );

  const requiresGitHubRepo = isCodeHeavy;
  const githubRepoUrl = resolveGitHubRepoUrl(project);
  const hasGitHubRepo = Boolean(githubRepoUrl);
  const blockingReason = requiresGitHubRepo && !hasGitHubRepo
    ? "Code-heavy delivery cannot advance to review or completion without a real GitHub repo linked to the project."
    : null;

  return {
    isCodeHeavy,
    requiresGitHubRepo,
    hasGitHubRepo,
    githubRepoUrl,
    blockingReason,
    completionBlocked: Boolean(blockingReason),
    completionCapPct: blockingReason ? 95 : null,
  };
}

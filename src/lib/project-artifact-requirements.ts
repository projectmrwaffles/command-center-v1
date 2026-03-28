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
    projectOrigin?: "new" | "existing" | null;
    links?: ProjectLinks | null;
    githubRepoProvisioning?: {
      status?: "pending" | "failed" | "ready" | null;
      reason?: string | null;
      attemptedAt?: string | null;
      nextAction?: string | null;
    } | null;
  } | null;
  links?: ProjectLinks | null;
  github_repo_binding?: GitHubRepoBinding | null;
};

export type ProjectArtifactIntegrity = {
  isCodeHeavy: boolean;
  requiresGitHubRepo: boolean;
  hasGitHubRepo: boolean;
  githubRepoUrl: string | null;
  pendingProvisioning: boolean;
  pendingProvisioningReason: string | null;
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

  const rawLink = project.links?.github || project.intake?.links?.github;
  const normalizedLink = normalizeUrl(rawLink);
  if (!normalizedLink) return null;

  return parseGitHubRepoUrl(normalizedLink)?.url || null;
}

function shouldTreatRepoAsPendingProvisioning(project: ArtifactIntegrityProjectLike, isCodeHeavy: boolean, hasGitHubRepo: boolean) {
  if (!isCodeHeavy || hasGitHubRepo) return false;

  const bindingProvisioningStatus = project.github_repo_binding?.provisioning?.status;
  const intakeProvisioningStatus = project.intake?.githubRepoProvisioning?.status;

  return bindingProvisioningStatus === "pending" || intakeProvisioningStatus === "pending";
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
  const pendingProvisioning = shouldTreatRepoAsPendingProvisioning(project, isCodeHeavy, hasGitHubRepo);
  const pendingProvisioningReason = pendingProvisioning
    ? project.intake?.githubRepoProvisioning?.reason || project.github_repo_binding?.provisioning?.reason || "GitHub repo provisioning is in progress for this code-heavy project. A real repo will still be required before review or completion."
    : null;

  const failedProvisioningReason = !hasGitHubRepo && project.intake?.githubRepoProvisioning?.status === "failed"
    ? [
        project.intake.githubRepoProvisioning.reason || "GitHub repo auto-provisioning failed.",
        project.intake.githubRepoProvisioning.nextAction || "Reconnect GitHub/gh auth or link an existing repository, then retry provisioning.",
      ].filter(Boolean).join(" ")
    : null;

  const blockingReason = failedProvisioningReason || (requiresGitHubRepo && !hasGitHubRepo && !pendingProvisioning
    ? "Code-heavy delivery cannot advance to review or completion without a real GitHub repo linked to the project."
    : null);

  return {
    isCodeHeavy,
    requiresGitHubRepo,
    hasGitHubRepo,
    githubRepoUrl,
    pendingProvisioning,
    pendingProvisioningReason,
    blockingReason,
    completionBlocked: Boolean(blockingReason),
    completionCapPct: blockingReason ? 95 : null,
  };
}

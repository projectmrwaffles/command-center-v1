import { normalizeUrl, type ProjectLinks } from "./project-links.ts";

export type GitHubRepoBinding = {
  provider: "github";
  owner: string;
  repo: string;
  fullName: string;
  url: string;
  source: "linked" | "provisioned";
  linkedAt: string;
  defaultBranch?: string | null;
  installationId?: number | null;
  projectLinkKey: "github";
  provisioning?: {
    status: "not_configured" | "pending" | "ready";
    reason: string;
  } | null;
};

export type GitHubRepoBindingInput = {
  url?: string | null;
  source?: "linked" | "provisioned";
  defaultBranch?: string | null;
  installationId?: number | null;
  provisioning?: GitHubRepoBinding["provisioning"];
};

export type GitHubRepoProvenance = {
  state: "none" | "linked" | "provisioned";
  label: "no repo yet" | "linked existing repo" | "auto-provisioned repo";
  description: string;
  mismatch: boolean;
  mismatchReason: string | null;
};

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const RESERVED_NAMES = new Set(["", "new", "settings", "orgs", "organizations", "marketplace", "features", "topics", "collections", "enterprise", "login", "signup"]);

function cleanSegment(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

export function parseGitHubRepoUrl(input?: string | null) {
  const normalized = normalizeUrl(input);
  if (!normalized) return null;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;

  const parts = url.pathname.split("/").filter(Boolean).map(cleanSegment);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  const ownerLower = owner.toLowerCase();
  const repoLower = repo.toLowerCase();

  if (!owner || !repo) return null;
  if (RESERVED_NAMES.has(ownerLower) || RESERVED_NAMES.has(repoLower)) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    url: `https://github.com/${owner}/${repo}`,
  };
}

export function createGitHubRepoBinding(input: GitHubRepoBindingInput, existing?: GitHubRepoBinding | null): GitHubRepoBinding | null {
  const parsed = parseGitHubRepoUrl(input.url);
  if (!parsed) return null;

  const source = input.source || existing?.source || "linked";
  const isSameRepo = existing?.provider === "github" && existing.fullName.toLowerCase() === parsed.fullName.toLowerCase();

  return {
    provider: "github",
    owner: parsed.owner,
    repo: parsed.repo,
    fullName: parsed.fullName,
    url: parsed.url,
    source,
    linkedAt: isSameRepo ? existing?.linkedAt || new Date().toISOString() : new Date().toISOString(),
    defaultBranch: input.defaultBranch !== undefined ? input.defaultBranch || null : isSameRepo ? existing?.defaultBranch || null : null,
    installationId: typeof input.installationId === "number" ? input.installationId : isSameRepo ? existing?.installationId || null : null,
    projectLinkKey: "github",
    provisioning:
      input.provisioning !== undefined
        ? input.provisioning
        : source === "provisioned"
          ? existing?.provisioning && isSameRepo
            ? existing.provisioning
            : {
                status: "pending",
                reason: "Provisioning scaffolded but not yet connected to authenticated GitHub runtime in this environment.",
              }
          : {
              status: "not_configured",
              reason: "Existing repository linked. Explicit provisioning is not configured in this environment.",
            },
  };
}

export function syncProjectLinksWithGitHubBinding(
  links: Record<string, string> | null | undefined,
  binding: GitHubRepoBinding | null | undefined
) {
  const next = { ...(links || {}) };

  if (binding?.url) {
    next.github = binding.url;
  } else {
    delete next.github;
  }

  return Object.keys(next).length > 0 ? next : null;
}

export function getGitHubRepoValidationError(input?: string | null) {
  if (input == null || input === "") return null;
  return parseGitHubRepoUrl(input)
    ? null
    : "GitHub repo must be a real github.com/<owner>/<repo> URL. Placeholder or non-repo links are not allowed.";
}

export function githubProvisioningAvailable() {
  return true;
}

export function getGitHubRepoProvenance(input: {
  binding?: GitHubRepoBinding | null;
  projectOrigin?: "new" | "existing" | null;
}) : GitHubRepoProvenance {
  const { binding, projectOrigin } = input;

  if (!binding?.url) {
    return {
      state: "none",
      label: "no repo yet",
      description: projectOrigin === "new"
        ? "No GitHub repo is linked yet. Net-new code-heavy projects can still be provisioned automatically when needed."
        : "No GitHub repo is linked yet.",
      mismatch: false,
      mismatchReason: null,
    };
  }

  const mismatch = projectOrigin === "new" && binding.source === "linked";
  if (binding.source === "provisioned") {
    return {
      state: "provisioned",
      label: "auto-provisioned repo",
      description: "This repository was created for this project during provisioning.",
      mismatch,
      mismatchReason: mismatch ? "This project is marked net-new but is linked to an existing repo instead of a provisioned workspace." : null,
    };
  }

  return {
    state: "linked",
    label: "linked existing repo",
    description: "This project is attached to a pre-existing GitHub repository.",
    mismatch,
    mismatchReason: mismatch ? "This project is marked net-new but currently points at an existing linked repo. Verify that the repo is intentional and not carried over from another project." : null,
  };
}

export function mergeProjectLinksForGitHubUpdate(
  existingLinks: Record<string, string> | null | undefined,
  incomingLinks: Record<string, string> | null | undefined,
  binding: GitHubRepoBinding | null | undefined,
  options?: { replaceAll?: boolean }
) {
  const base = options?.replaceAll ? {} : { ...(existingLinks || {}) };
  const merged = incomingLinks ? { ...base, ...incomingLinks } : base;
  return syncProjectLinksWithGitHubBinding(merged, binding);
}

export function getGitHubRepoUrlFromProjectArtifacts(input: {
  githubRepo?: GitHubRepoBindingInput | null;
  links?: ProjectLinks | null;
  intakeLinks?: ProjectLinks | null;
}) {
  return input.githubRepo?.url || input.links?.github || input.intakeLinks?.github || null;
}

export function getNetNewGitHubRepoGuardError(input: {
  projectOrigin?: "new" | "existing" | null;
  githubRepoUrl?: string | null;
  confirmLinkedRepo?: boolean;
}) {
  if (input.projectOrigin !== "new") return null;
  if (!input.githubRepoUrl) return null;
  if (input.confirmLinkedRepo) return null;
  return "Net-new projects cannot silently inherit an existing GitHub repo. Remove the repo link, switch the project origin to existing, or explicitly confirm that the linked repo is intentional.";
}

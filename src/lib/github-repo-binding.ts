import { normalizeUrl } from "./project-links.ts";

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

export function createGitHubRepoBinding(input: GitHubRepoBindingInput): GitHubRepoBinding | null {
  const parsed = parseGitHubRepoUrl(input.url);
  if (!parsed) return null;

  return {
    provider: "github",
    owner: parsed.owner,
    repo: parsed.repo,
    fullName: parsed.fullName,
    url: parsed.url,
    source: input.source || "linked",
    linkedAt: new Date().toISOString(),
    defaultBranch: input.defaultBranch || null,
    installationId: typeof input.installationId === "number" ? input.installationId : null,
    projectLinkKey: "github",
    provisioning:
      input.source === "provisioned"
        ? {
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
  return false;
}

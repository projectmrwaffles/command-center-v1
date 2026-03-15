export const PROJECT_LINK_FIELDS = [
  "github",
  "preview",
  "production",
  "docs",
  "figma",
  "admin",
] as const;

export type ProjectLinkKey = (typeof PROJECT_LINK_FIELDS)[number];

export type ProjectLinks = Partial<Record<ProjectLinkKey, string>>;

export const PROJECT_LINK_LABELS: Record<ProjectLinkKey, string> = {
  github: "GitHub",
  preview: "Preview",
  production: "Production",
  docs: "Docs",
  figma: "Figma",
  admin: "Admin",
};

export function normalizeUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizeProjectLinks(input: unknown): ProjectLinks | null {
  if (!input || typeof input !== "object") return null;

  const output: ProjectLinks = {};
  for (const key of PROJECT_LINK_FIELDS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value !== "string") continue;

    const normalized = normalizeUrl(value);
    if (normalized) {
      output[key] = normalized;
    }
  }

  return Object.keys(output).length > 0 ? output : null;
}

export function getProjectLinkEntries(links?: ProjectLinks | null) {
  if (!links) return [] as Array<{ key: ProjectLinkKey; label: string; url: string }>;

  return PROJECT_LINK_FIELDS.flatMap((key) => {
    const url = links[key];
    return url ? [{ key, label: PROJECT_LINK_LABELS[key], url }] : [];
  });
}

import fs from "node:fs";
import path from "node:path";

export type RequirementSource = {
  title: string;
  type: string;
  evidence: string[];
};

export type ProjectRequirements = {
  derivedAt: string;
  summary: string[];
  constraints: string[];
  requiredFrameworks: string[];
  sourceCount: number;
  sources: RequirementSource[];
};

export type ProjectLikeWithRequirements = {
  name?: string | null;
  intake?: {
    summary?: string | null;
    goals?: string | null;
    requirements?: ProjectRequirements | null;
  } | null;
  links?: {
    github?: string | null;
  } | null;
  github_repo_binding?: {
    url?: string | null;
  } | null;
};

export type RequirementCompliance = {
  repoWorkspacePath: string | null;
  detectedFrameworks: string[];
  violations: string[];
  notes: string[];
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceSplit(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

function extractPdfLikeText(buffer: Buffer) {
  const raw = buffer.toString("latin1");
  const matches = [...raw.matchAll(/\(([^()]{3,400})\)/g)].map((match) => normalizeWhitespace(match[1] || ""));
  const cleaned = matches
    .map((entry) => entry.replace(/\\[nrtbf()\\]/g, " "))
    .filter((entry) => /[A-Za-z]/.test(entry));
  return cleaned.join("\n");
}

function extractTextFromBuffer(buffer: Buffer, mimeType?: string | null, title?: string | null) {
  const lowerTitle = String(title || "").toLowerCase();
  if ((mimeType || "").startsWith("text/") || /\.(md|txt|json|yaml|yml)$/i.test(lowerTitle)) {
    return buffer.toString("utf8");
  }
  if (mimeType === "application/pdf" || /\.pdf$/i.test(lowerTitle)) {
    return extractPdfLikeText(buffer);
  }
  return "";
}

function collectFrameworks(text: string) {
  const frameworks = new Set<string>();
  const sentences = sentenceSplit(text).map((sentence) => sentence.toLowerCase());
  const candidates: Array<{ key: string; pattern: RegExp }> = [
    { key: "nextjs", pattern: /\bnext\s*\.?(?:js)?\b|\bnextjs\b/ },
    { key: "vite", pattern: /\bvite\b/ },
    { key: "react-native", pattern: /\breact\s+native\b/ },
    { key: "expo", pattern: /\bexpo\b/ },
    { key: "remix", pattern: /\bremix\b/ },
  ];

  for (const { key, pattern } of candidates) {
    const positiveMention = sentences.some((sentence) => {
      if (!pattern.test(sentence)) return false;
      return !/(do not use|don't use|not use|avoid|instead of|rather than|no )/.test(sentence);
    });
    if (positiveMention) frameworks.add(key);
  }

  return [...frameworks];
}

function collectConstraintSentences(text: string) {
  const sentences = sentenceSplit(text);
  return sentences.filter((sentence) => /\b(must|should|required|requirement|use|built with|build with|stack|framework|tech stack|next\.js|nextjs|vite|react native|expo|tailwind|supabase)\b/i.test(sentence)).slice(0, 12);
}

function dedupeStrings(values: string[], limit = 12) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

export function deriveProjectRequirements(input: {
  intakeSummary?: string | null;
  intakeGoals?: string | null;
  existing?: ProjectRequirements | null;
  documents?: Array<{ title: string; type: string; text?: string | null }>;
}) {
  const sourceTexts = [input.intakeSummary, input.intakeGoals, ...(input.documents || []).map((doc) => doc.text || "")]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const combinedText = sourceTexts.join("\n\n");
  const requiredFrameworks = dedupeStrings([
    ...(input.existing?.requiredFrameworks || []),
    ...collectFrameworks(combinedText),
  ], 6).map((framework) => framework.toLowerCase());

  const constraints = dedupeStrings([
    ...(input.existing?.constraints || []),
    ...collectConstraintSentences(combinedText),
  ], 12);

  const documentSources = (input.documents || [])
    .map((document) => ({
      title: document.title,
      type: document.type,
      evidence: dedupeStrings([
        ...collectConstraintSentences(document.text || ""),
        ...collectFrameworks(document.text || "").map((framework) => `Required framework: ${framework}`),
      ], 4),
    }))
    .filter((document) => document.evidence.length > 0);

  const existingSources = input.existing?.sources || [];
  const sources = [...existingSources];
  for (const source of documentSources) {
    const existingIndex = sources.findIndex((candidate) => candidate.title === source.title && candidate.type === source.type);
    if (existingIndex >= 0) {
      sources[existingIndex] = {
        ...sources[existingIndex],
        evidence: dedupeStrings([...sources[existingIndex].evidence, ...source.evidence], 6),
      };
    } else {
      sources.push(source);
    }
  }

  const summary = dedupeStrings([
    requiredFrameworks.length ? `Required frameworks: ${requiredFrameworks.join(", ")}` : "",
    ...constraints,
  ], 8);

  return {
    derivedAt: new Date().toISOString(),
    summary,
    constraints,
    requiredFrameworks,
    sourceCount: sources.length,
    sources,
  } satisfies ProjectRequirements;
}

export function extractRequirementsFromUploadedFile(input: { buffer: Buffer; mimeType?: string | null; title?: string | null; type?: string }) {
  const text = extractTextFromBuffer(input.buffer, input.mimeType, input.title);
  return {
    title: input.title || "Untitled document",
    type: input.type || "other",
    text,
  };
}

function resolveGithubRepoUrl(project: ProjectLikeWithRequirements) {
  return project.github_repo_binding?.url || project.links?.github || null;
}

function getRepoSlugFromUrl(url: string | null) {
  const normalized = String(url || "").trim().replace(/\.git$/i, "");
  const match = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)$/i);
  return match ? match[2] : null;
}

export function resolveRepoWorkspacePath(project: ProjectLikeWithRequirements) {
  const repoSlug = getRepoSlugFromUrl(resolveGithubRepoUrl(project));
  if (!repoSlug) return null;

  const openClawRoot = path.join(process.env.HOME || "", ".openclaw");
  const candidates = [
    path.join(openClawRoot, "workspace-product-lead", "projects", repoSlug),
    path.join(openClawRoot, "workspace-tech-lead-architect", "projects", repoSlug),
    path.join(openClawRoot, "workspace", "projects", repoSlug),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function inspectRepoFrameworks(repoWorkspacePath: string | null) {
  if (!repoWorkspacePath) return { detectedFrameworks: [] as string[], notes: ["No repo workspace path found."] };
  const packageJsonPath = path.join(repoWorkspacePath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return { detectedFrameworks: [] as string[], notes: [`package.json not found at ${packageJsonPath}`] };
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } as Record<string, string>;
    const detected = new Set<string>();
    if (deps.next) detected.add("nextjs");
    if (deps.vite) detected.add("vite");
    if (deps["react-native"]) detected.add("react-native");
    if (deps.expo) detected.add("expo");
    if (deps["@remix-run/react"] || deps["@remix-run/node"]) detected.add("remix");
    return { detectedFrameworks: [...detected], notes: [`Inspected ${packageJsonPath}`] };
  } catch (error) {
    return { detectedFrameworks: [], notes: [error instanceof Error ? error.message : "Failed to parse package.json"] };
  }
}

export function getProjectRequirementCompliance(project: ProjectLikeWithRequirements): RequirementCompliance {
  const requirements = project.intake?.requirements;
  const repoWorkspacePath = resolveRepoWorkspacePath(project);
  const { detectedFrameworks, notes } = inspectRepoFrameworks(repoWorkspacePath);
  const violations: string[] = [];

  for (const requiredFramework of requirements?.requiredFrameworks || []) {
    if (!detectedFrameworks.includes(requiredFramework)) {
      const observed = detectedFrameworks.length ? detectedFrameworks.join(", ") : "none detected";
      violations.push(`PRD/spec requires ${requiredFramework}, but repo shows ${observed}.`);
    }
  }

  return {
    repoWorkspacePath,
    detectedFrameworks,
    violations,
    notes,
  };
}

export function formatRequirementsForPrompt(project: ProjectLikeWithRequirements) {
  const requirements = project.intake?.requirements;
  if (!requirements) return null;

  const lines = [
    requirements.requiredFrameworks.length ? `Required frameworks: ${requirements.requiredFrameworks.join(", ")}` : null,
    ...requirements.constraints.slice(0, 8).map((constraint) => `- ${constraint}`),
    ...requirements.sources.slice(0, 3).map((source) => `${source.title}: ${source.evidence.join(" | ")}`),
  ].filter(Boolean);

  if (lines.length === 0) return null;
  return lines.join("\n");
}

import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PDFParse } from "pdf-parse";

import type {
  ProjectLikeWithRequirements,
  ProjectRequirements,
  RequirementChoice,
  RequirementCompliance,
  RequirementDirective,
  RequirementSignalKind,
  RequirementSource,
  TechnologyRequirement,
} from "@/lib/project-requirements.types";

function isHostDependentExtractionAllowed() {
  return !process.env.VERCEL;
}

type RepoSignals = {
  frameworks: string[];
  languages: string[];
  styling: string[];
  backend: string[];
  runtime: string[];
  tooling: string[];
  database: string[];
};

type ParsedSentenceRequirement = {
  requirement: TechnologyRequirement;
  source: RequirementSource;
};

type TechnologyCatalogEntry = RequirementChoice & {
  patterns: RegExp[];
};

const TECHNOLOGY_CATALOG: TechnologyCatalogEntry[] = [
  { slug: "nextjs", label: "Next.js", aliases: ["nextjs", "next.js", "next"], kind: "framework", patterns: [/\bnext\s*\.?(?:js)?\b/i, /\bnextjs\b/i] },
  { slug: "vite", label: "Vite", aliases: ["vite"], kind: "framework", patterns: [/\bvite\b/i] },
  { slug: "remix", label: "Remix", aliases: ["remix"], kind: "framework", patterns: [/\bremix\b/i] },
  { slug: "react-native", label: "React Native", aliases: ["react native"], kind: "framework", patterns: [/\breact\s+native\b/i] },
  { slug: "expo", label: "Expo", aliases: ["expo"], kind: "framework", patterns: [/\bexpo\b/i] },
  { slug: "react", label: "React", aliases: ["react"], kind: "framework", patterns: [/\breact\b(?!\s+native\b)/i] },
  { slug: "typescript", label: "TypeScript", aliases: ["typescript", "ts"], kind: "language", patterns: [/\btypescript\b/i] },
  { slug: "javascript", label: "JavaScript", aliases: ["javascript", "js"], kind: "language", patterns: [/\bjavascript\b/i] },
  { slug: "tailwind", label: "Tailwind CSS", aliases: ["tailwind", "tailwindcss", "tailwind css"], kind: "styling", patterns: [/\btailwind(?:css)?\b/i, /\btailwind\s+css\b/i] },
  { slug: "shadcn-ui", label: "shadcn/ui", aliases: ["shadcn", "shadcn/ui"], kind: "tooling", patterns: [/\bshadcn(?:\/ui)?\b/i] },
  { slug: "supabase", label: "Supabase", aliases: ["supabase"], kind: "backend", patterns: [/\bsupabase\b/i] },
  { slug: "postgresql", label: "PostgreSQL", aliases: ["postgres", "postgresql"], kind: "database", patterns: [/\bpostgres(?:ql)?\b/i] },
  { slug: "nodejs", label: "Node.js", aliases: ["node", "node.js", "nodejs"], kind: "runtime", patterns: [/\bnode\s*\.?(?:js)?\b/i, /\bnodejs\b/i] },
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceSplit(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

function extractPdfLikeTextFallback(buffer: Buffer) {
  const raw = buffer.toString("latin1");
  const matches = [...raw.matchAll(/\(([^()]{3,400})\)/g)].map((match) => normalizeWhitespace(match[1] || ""));
  const cleaned = matches
    .map((entry) => entry.replace(/\\[nrtbf()\\]/g, " "))
    .filter((entry) => /[A-Za-z]/.test(entry));
  return cleaned.join("\n");
}

async function extractPdfTextWithPython(buffer: Buffer) {
  if (!isHostDependentExtractionAllowed()) {
    return "";
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccv1-pdf-extract-"));
  const pdfPath = path.join(tempDir, "upload.pdf");

  try {
    fs.writeFileSync(pdfPath, buffer);
    const { stdout } = await execFileAsync(
      "python3",
      [
        "-c",
        [
          "from pathlib import Path",
          "from PyPDF2 import PdfReader",
          "reader = PdfReader(str(Path(__import__('sys').argv[1])))",
          "print(' '.join((page.extract_text() or '').strip() for page in reader.pages))",
        ].join("; "),
        pdfPath,
      ],
      {
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024,
        encoding: "utf8",
      }
    );
    return normalizeWhitespace(String(stdout || ""));
  } catch (error) {
    console.warn("[project-requirements] python PDF extraction failed", error);
    return "";
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function extractPdfText(buffer: Buffer) {
  let parser: InstanceType<typeof PDFParse> | null = null;

  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const parsedText = normalizeWhitespace(result.text || "");
    if (parsedText) return parsedText;
  } catch (error) {
    console.warn("[project-requirements] structured PDF extraction failed; falling back to python/raw parse", error);
  } finally {
    if (parser) {
      await parser.destroy().catch(() => undefined);
    }
  }

  const pythonText = await extractPdfTextWithPython(buffer);
  if (pythonText) return pythonText;

  return extractPdfLikeTextFallback(buffer);
}

const execFileAsync = promisify(execFile);

function extensionForMimeType(mimeType?: string | null, title?: string | null) {
  const lowerTitle = String(title || "").toLowerCase();
  if (/\.png$/i.test(lowerTitle) || mimeType === "image/png") return ".png";
  if (/\.jpe?g$/i.test(lowerTitle) || mimeType === "image/jpeg") return ".jpg";
  if (/\.gif$/i.test(lowerTitle) || mimeType === "image/gif") return ".gif";
  if (/\.webp$/i.test(lowerTitle) || mimeType === "image/webp") return ".webp";
  if (/\.heic$/i.test(lowerTitle) || mimeType === "image/heic") return ".heic";
  return ".img";
}

async function extractImageText(buffer: Buffer, mimeType?: string | null, title?: string | null) {
  if (!isHostDependentExtractionAllowed() || process.platform !== "darwin") return "";

  const scriptPath = path.join(process.cwd(), "scripts", "extract-image-text.swift");
  if (!fs.existsSync(scriptPath)) return "";

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccv1-image-ocr-"));
  const imagePath = path.join(tempDir, `upload${extensionForMimeType(mimeType, title)}`);

  try {
    fs.writeFileSync(imagePath, buffer);
    const { stdout } = await execFileAsync("swift", [scriptPath, imagePath], {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    });
    return String(stdout || "")
      .split(/\r?\n/)
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean)
      .join("\n");
  } catch (error) {
    console.warn("[project-requirements] image OCR failed", error);
    return "";
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function extractTextFromBuffer(buffer: Buffer, mimeType?: string | null, title?: string | null) {
  const lowerTitle = String(title || "").toLowerCase();
  if ((mimeType || "").startsWith("text/") || /\.(md|txt|json|yaml|yml)$/i.test(lowerTitle)) {
    return buffer.toString("utf8");
  }
  if (mimeType === "application/pdf" || /\.pdf$/i.test(lowerTitle)) {
    return extractPdfText(buffer);
  }
  if ((mimeType || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(lowerTitle)) {
    return extractImageText(buffer, mimeType, title);
  }
  return "";
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

function dedupeChoices(choices: RequirementChoice[]) {
  const bySlug = new Map<string, RequirementChoice>();
  for (const choice of choices) {
    if (!bySlug.has(choice.slug)) bySlug.set(choice.slug, choice);
  }
  return [...bySlug.values()];
}

function sentenceLooksLikeConstraint(sentence: string) {
  return /\b(must|should|required|requirement|use|built with|build with|stack|framework|tech stack|do not use|don't use|avoid|instead of|rather than|never use|no )\b/i.test(sentence);
}

function matchChoices(text: string) {
  return TECHNOLOGY_CATALOG.filter((entry) => entry.patterns.some((pattern) => pattern.test(text))).map((entry) => ({
    slug: entry.slug,
    label: entry.label,
    aliases: entry.aliases,
    kind: entry.kind,
  }));
}

function detectDirective(sentence: string): RequirementDirective | null {
  const value = sentence.toLowerCase();
  if (/\b(do not use|don't use|do not build with|avoid using|avoid|instead of|rather than|never use|must not use|no )\b/.test(value)) {
    return "forbidden";
  }
  if (/\b(must use|must be built with|required to use|required|needs to use|has to use|built with|build with)\b/.test(value)) {
    return "required";
  }
  if (/\b(can use|may use|use either|either .* or .*|or|allowed|one of)\b/.test(value)) {
    return "allowed";
  }
  return null;
}

function mergeRequirement(existing: TechnologyRequirement | undefined, next: TechnologyRequirement) {
  if (!existing) return next;
  return {
    ...existing,
    rationale: existing.rationale.length >= next.rationale.length ? existing.rationale : next.rationale,
    choices: dedupeChoices([...existing.choices, ...next.choices]),
    sourceTitles: dedupeStrings([...existing.sourceTitles, ...next.sourceTitles], 8),
  } satisfies TechnologyRequirement;
}

function keyForRequirement(requirement: TechnologyRequirement) {
  return `${requirement.directive}:${requirement.kind}:${requirement.choices.map((choice) => choice.slug).sort().join("|")}`;
}

function parseSentenceRequirements(sentence: string, sourceTitle: string, sourceType: string): ParsedSentenceRequirement[] {
  if (!sentenceLooksLikeConstraint(sentence)) return [];
  const choices = dedupeChoices(matchChoices(sentence));
  if (!choices.length) return [];

  const directive = detectDirective(sentence);
  const byKind = new Map<RequirementSignalKind, RequirementChoice[]>();
  for (const choice of choices) {
    const list = byKind.get(choice.kind) || [];
    list.push(choice);
    byKind.set(choice.kind, list);
  }

  const parsed: ParsedSentenceRequirement[] = [];
  for (const [kind, groupedChoices] of byKind.entries()) {
    const finalDirective = directive || (groupedChoices.length > 1 ? "allowed" : "required");
    const requirement: TechnologyRequirement = {
      directive: finalDirective,
      kind,
      rationale: sentence,
      choices: dedupeChoices(groupedChoices),
      sourceTitles: [sourceTitle],
    };
    parsed.push({
      requirement,
      source: {
        title: sourceTitle,
        type: sourceType,
        evidence: [sentence],
      },
    });
  }

  return parsed;
}

function normalizeExistingRequirement(raw: any): TechnologyRequirement | null {
  if (!raw || typeof raw !== "object") return null;
  const directive = raw.directive;
  const kind = raw.kind;
  const rawChoices = Array.isArray(raw.choices) ? raw.choices : [];
  if (!["required", "allowed", "forbidden"].includes(directive)) return null;
  if (!rawChoices.length) return null;

  const choices = dedupeChoices(rawChoices
    .map((choice: any) => {
      if (!choice || typeof choice !== "object") return null;
      const slug = normalizeWhitespace(String(choice.slug || "")).toLowerCase();
      if (!slug) return null;
      const catalogMatch = TECHNOLOGY_CATALOG.find((entry) => entry.slug === slug);
      return {
        slug,
        label: normalizeWhitespace(String(choice.label || catalogMatch?.label || slug)),
        aliases: dedupeStrings(Array.isArray(choice.aliases) ? choice.aliases.map(String) : catalogMatch?.aliases || [], 8),
        kind: (choice.kind || kind || catalogMatch?.kind || "other") as RequirementSignalKind,
      } satisfies RequirementChoice;
    })
    .filter(Boolean) as RequirementChoice[]);

  if (!choices.length) return null;

  return {
    directive,
    kind: (kind || choices[0]?.kind || "other") as RequirementSignalKind,
    rationale: normalizeWhitespace(String(raw.rationale || raw.summary || "")),
    choices,
    sourceTitles: dedupeStrings(Array.isArray(raw.sourceTitles) ? raw.sourceTitles.map(String) : [], 8),
  } satisfies TechnologyRequirement;
}

function collectTechnologyRequirements(input: {
  intakeSummary?: string | null;
  intakeGoals?: string | null;
  existing?: ProjectRequirements | null;
  documents?: Array<{ title: string; type: string; text?: string | null }>;
}) {
  const buckets = new Map<string, TechnologyRequirement>();
  const sourceMap = new Map<string, RequirementSource>();

  const addParsed = (parsed: ParsedSentenceRequirement) => {
    const key = keyForRequirement(parsed.requirement);
    buckets.set(key, mergeRequirement(buckets.get(key), parsed.requirement));

    const sourceKey = `${parsed.source.title}::${parsed.source.type}`;
    const existingSource = sourceMap.get(sourceKey);
    sourceMap.set(sourceKey, {
      title: parsed.source.title,
      type: parsed.source.type,
      evidence: dedupeStrings([...(existingSource?.evidence || []), ...parsed.source.evidence], 6),
    });
  };

  for (const requirement of input.existing?.technologyRequirements || []) {
    const normalized = normalizeExistingRequirement(requirement);
    if (!normalized) continue;
    buckets.set(keyForRequirement(normalized), mergeRequirement(buckets.get(keyForRequirement(normalized)), normalized));
  }

  for (const legacyFramework of input.existing?.requiredFrameworks || []) {
    const slug = normalizeWhitespace(String(legacyFramework)).toLowerCase();
    const catalogMatch = TECHNOLOGY_CATALOG.find((entry) => entry.slug === slug);
    if (!catalogMatch) continue;
    const requirement: TechnologyRequirement = {
      directive: "required",
      kind: catalogMatch.kind,
      rationale: `Legacy required framework: ${catalogMatch.label}`,
      choices: [{ slug: catalogMatch.slug, label: catalogMatch.label, aliases: catalogMatch.aliases, kind: catalogMatch.kind }],
      sourceTitles: [],
    };
    buckets.set(keyForRequirement(requirement), mergeRequirement(buckets.get(keyForRequirement(requirement)), requirement));
  }

  const sources = [
    { title: "Project summary", type: "intake", text: input.intakeSummary || "" },
    { title: "Project goals", type: "intake", text: input.intakeGoals || "" },
    ...(input.documents || []).map((document) => ({ title: document.title, type: document.type, text: document.text || "" })),
  ].filter((source) => source.text.trim().length > 0);

  for (const source of sources) {
    const sourceKey = `${source.title}::${source.type}`;
    const baselineEvidence = evidenceForSource(source.text);
    if (baselineEvidence.length > 0) {
      const existingSource = sourceMap.get(sourceKey);
      sourceMap.set(sourceKey, {
        title: source.title,
        type: source.type,
        evidence: dedupeStrings([...(existingSource?.evidence || []), ...baselineEvidence], 6),
      });
    }

    for (const sentence of sentenceSplit(source.text)) {
      for (const parsed of parseSentenceRequirements(sentence, source.title, source.type)) {
        addParsed(parsed);
      }
    }
  }

  const mergedSources = dedupeStrings([...(input.existing?.sources || []).map((source) => `${source.title}::${source.type}`), ...sourceMap.keys()], 100)
    .map((key) => {
      const [title, type] = key.split("::");
      const existing = (input.existing?.sources || []).find((source) => source.title === title && source.type === type);
      const parsed = sourceMap.get(key);
      return {
        title,
        type,
        evidence: dedupeStrings([...(existing?.evidence || []), ...(parsed?.evidence || [])], 6),
      } satisfies RequirementSource;
    })
    .filter((source) => source.evidence.length > 0);

  return {
    technologyRequirements: [...buckets.values()],
    sources: mergedSources,
  };
}

function collectConstraintSentences(text: string) {
  return sentenceSplit(text).filter((sentence) => sentenceLooksLikeConstraint(sentence)).slice(0, 12);
}

function collectStructuredRequirementEvidence(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "")))
    .filter(Boolean);

  return dedupeStrings(lines.filter((line) => {
    if (line.length < 12) return false;
    if (/^#{1,6}\s/.test(line)) return false;
    if (/^(objective|product summary|users|jobs to be done|mvp feature requirements|non-functional requirements|success criteria|deferred from mvp|open decisions)$/i.test(line)) return false;
    if (/^(primary:|not in scope for mvp:|supported statuses:|framework:|ui scope:|initial state\/storage:|architecture goal:)/i.test(line)) return true;
    if (/\b(should|must|required|required title|status|empty state|error state|responsive|under \d+ minutes|one interaction|preserve|open or create|add|edit|remove|reorder|deferred|review|calendar sync|notifications|collaboration|analytics)\b/i.test(line)) return true;
    return false;
  }), 20);
}

function evidenceForSource(text: string) {
  return dedupeStrings([
    ...collectConstraintSentences(text),
    ...collectStructuredRequirementEvidence(text),
  ], 6);
}

function buildRequirementSummary(requirements: TechnologyRequirement[]) {
  const lines: string[] = [];
  for (const requirement of requirements) {
    const labels = requirement.choices.map((choice) => choice.label).join(" or ");
    if (requirement.directive === "required") {
      lines.push(`Must use ${labels}${requirement.kind === "language" ? "" : ` (${requirement.kind})`}.`);
    } else if (requirement.directive === "allowed") {
      lines.push(`Allowed ${requirement.kind}: ${labels}.`);
    } else {
      lines.push(`Do not use ${labels}${requirement.kind === "language" ? "" : ` (${requirement.kind})`}.`);
    }
  }
  return dedupeStrings(lines, 10);
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
  const { technologyRequirements, sources } = collectTechnologyRequirements(input);
  const constraints = dedupeStrings([
    ...(input.existing?.constraints || []),
    ...collectConstraintSentences(combinedText),
    ...technologyRequirements.map((requirement) => requirement.rationale),
  ], 16);

  const requiredFrameworks = dedupeStrings(
    technologyRequirements
      .filter((requirement) => requirement.directive === "required" && requirement.kind === "framework")
      .flatMap((requirement) => requirement.choices.map((choice) => choice.slug)),
    8,
  ).map((framework) => framework.toLowerCase());

  const summary = dedupeStrings([
    ...buildRequirementSummary(technologyRequirements),
    ...constraints,
    ...sources.flatMap((source) => source.evidence),
  ], 10);

  return {
    derivedAt: new Date().toISOString(),
    summary,
    constraints,
    requiredFrameworks,
    sourceCount: sources.length,
    sources,
    technologyRequirements,
  } satisfies ProjectRequirements;
}

export async function extractRequirementsFromUploadedFile(input: { buffer: Buffer; mimeType?: string | null; title?: string | null; type?: string }) {
  const text = await extractTextFromBuffer(input.buffer, input.mimeType, input.title);
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
  const emptyDetection = {
    detectedFrameworks: [] as string[],
    detectedLanguages: [] as string[],
    detectedStyling: [] as string[],
    detectedBackends: [] as string[],
    detectedRuntimes: [] as string[],
    detectedTooling: [] as string[],
    detectedDatabases: [] as string[],
  };

  if (!repoWorkspacePath) return { ...emptyDetection, notes: ["No repo workspace path found."] };
  const packageJsonPath = path.join(repoWorkspacePath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return { ...emptyDetection, notes: [`package.json not found at ${packageJsonPath}`] };
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } as Record<string, string>;
    const detected = {
      frameworks: new Set<string>(),
      languages: new Set<string>(),
      styling: new Set<string>(),
      backend: new Set<string>(),
      runtime: new Set<string>(),
      tooling: new Set<string>(),
      database: new Set<string>(),
    };

    if (deps.next) detected.frameworks.add("nextjs");
    if (deps.vite) detected.frameworks.add("vite");
    if (deps["react-native"]) detected.frameworks.add("react-native");
    if (deps.expo) detected.frameworks.add("expo");
    if (deps["@remix-run/react"] || deps["@remix-run/node"]) detected.frameworks.add("remix");
    if (deps.react) detected.frameworks.add("react");
    if (deps.typescript) detected.languages.add("typescript");
    if (deps.tailwindcss) detected.styling.add("tailwind");
    if (deps["@supabase/supabase-js"]) detected.backend.add("supabase");
    if (deps["pg"] || deps["@types/pg"]) detected.database.add("postgresql");
    if (deps["shadcn-ui"] || deps["@shadcn/ui"] || deps["shadcn"] || deps["class-variance-authority"]) detected.tooling.add("shadcn-ui");
    if (deps.node || pkg.engines?.node) detected.runtime.add("nodejs");

    return {
      detectedFrameworks: [...detected.frameworks],
      detectedLanguages: [...detected.languages],
      detectedStyling: [...detected.styling],
      detectedBackends: [...detected.backend],
      detectedRuntimes: [...detected.runtime],
      detectedTooling: [...detected.tooling],
      detectedDatabases: [...detected.database],
      notes: [`Inspected ${packageJsonPath}`],
    };
  } catch (error) {
    return {
      ...emptyDetection,
      notes: [error instanceof Error ? error.message : "Failed to parse package.json"],
    };
  }
}

function repoSignalsFromInspection(repoWorkspacePath: string | null): RepoSignals & { notes: string[] } {
  const inspected = inspectRepoFrameworks(repoWorkspacePath);
  return {
    frameworks: inspected.detectedFrameworks,
    languages: inspected.detectedLanguages,
    styling: inspected.detectedStyling,
    backend: inspected.detectedBackends,
    runtime: inspected.detectedRuntimes,
    tooling: inspected.detectedTooling,
    database: inspected.detectedDatabases,
    notes: inspected.notes,
  };
}

function observedSignalsForKind(signals: RepoSignals, kind: RequirementSignalKind) {
  if (kind === "framework") return signals.frameworks;
  if (kind === "language") return signals.languages;
  if (kind === "styling") return signals.styling;
  if (kind === "backend") return signals.backend;
  if (kind === "runtime") return signals.runtime;
  if (kind === "tooling") return signals.tooling;
  if (kind === "database") return signals.database;
  return [];
}

export function getProjectRequirementCompliance(project: ProjectLikeWithRequirements): RequirementCompliance {
  const requirements = project.intake?.requirements;
  const repoWorkspacePath = resolveRepoWorkspacePath(project);
  const inspected = repoSignalsFromInspection(repoWorkspacePath);
  const violations: string[] = [];

  for (const requirement of requirements?.technologyRequirements || []) {
    const observed = observedSignalsForKind(inspected, requirement.kind);
    const expected = requirement.choices.map((choice) => choice.slug);
    const labels = requirement.choices.map((choice) => choice.label).join(" or ");
    if (requirement.directive === "required" && expected.length > 0 && !expected.some((slug) => observed.includes(slug))) {
      violations.push(`PRD/spec requires ${labels}, but repo shows ${observed.length ? observed.join(", ") : "none detected"} for ${requirement.kind}.`);
    }
    if (requirement.directive === "forbidden") {
      const presentForbidden = expected.filter((slug) => observed.includes(slug));
      if (presentForbidden.length > 0) {
        violations.push(`PRD/spec forbids ${presentForbidden.join(", ")}, but repo currently includes ${presentForbidden.join(", ")}.`);
      }
    }
  }

  for (const requiredFramework of requirements?.requiredFrameworks || []) {
    if (!inspected.frameworks.includes(requiredFramework)) {
      const observed = inspected.frameworks.length ? inspected.frameworks.join(", ") : "none detected";
      const alreadyCovered = violations.some((violation) => violation.includes(requiredFramework));
      if (!alreadyCovered) {
        violations.push(`PRD/spec requires ${requiredFramework}, but repo shows ${observed}.`);
      }
    }
  }

  return {
    repoWorkspacePath,
    detectedFrameworks: inspected.frameworks,
    detectedLanguages: inspected.languages,
    detectedStyling: inspected.styling,
    detectedBackends: inspected.backend,
    detectedRuntimes: inspected.runtime,
    detectedTooling: inspected.tooling,
    detectedDatabases: inspected.database,
    violations,
    notes: inspected.notes,
  };
}

export function formatRequirementsForPrompt(project: ProjectLikeWithRequirements) {
  const requirements = project.intake?.requirements;
  if (!requirements) return null;

  const contractLines = requirements.technologyRequirements.flatMap((requirement) => {
    const labels = requirement.choices.map((choice) => choice.label).join(" or ");
    if (!labels) return [];
    if (requirement.directive === "required") return [`- Must use ${labels} (${requirement.kind})`];
    if (requirement.directive === "allowed") return [`- Allowed ${requirement.kind}: ${labels}`];
    return [`- Forbidden ${requirement.kind}: ${labels}`];
  });

  const lines = [
    contractLines.length ? "Technology contract:" : null,
    ...contractLines,
    requirements.constraints.length ? "Constraint evidence:" : null,
    ...requirements.constraints.slice(0, 8).map((constraint) => `- ${constraint}`),
    ...requirements.sources.slice(0, 3).map((source) => `${source.title}: ${source.evidence.join(" | ")}`),
  ].filter(Boolean);

  if (lines.length === 0) return null;
  return lines.join("\n");
}

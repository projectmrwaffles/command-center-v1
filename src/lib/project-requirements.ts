import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const currentModuleDir = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
import { execFile } from "node:child_process";
import { spawnSync } from "node:child_process";
import { promisify } from "node:util";

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
import { getGitHubToken } from "./github-provisioning.ts";
import { parseGitHubRepoUrl } from "./github-repo-binding.ts";

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

function normalizeSourceText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeSourceText(entry))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return String(value);
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

async function importPdfJsModule() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

async function extractPdfTextWithPdfJs(buffer: Buffer) {
  try {
    const pdfjs = await importPdfJsModule();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false,
    } as any);
    const pdf = await loadingTask.promise;

    try {
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = normalizeWhitespace(
          (content.items || [])
            .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
            .join(" ")
        );
        if (text) pages.push(text);
      }
      return normalizeWhitespace(pages.join(" "));
    } finally {
      await pdf.destroy();
    }
  } catch (error) {
    console.warn("[project-requirements] pdfjs PDF extraction failed", error);
    return "";
  }
}

async function extractPdfTextLayer(buffer: Buffer) {
  const pythonText = await extractPdfTextWithPython(buffer);
  if (pythonText) return pythonText;

  const pdfJsText = await extractPdfTextWithPdfJs(buffer);
  if (pdfJsText) return pdfJsText;

  return extractPdfLikeTextFallback(buffer);
}

type OcrWorkerLike = {
  recognize: (image: Buffer) => Promise<{ data?: { text?: string | null } | null }>;
  terminate: () => Promise<unknown>;
};

const SCANNED_PDF_OCR_PAGE_LIMIT = 10;

let ocrWorkerPromise: Promise<OcrWorkerLike> | null = null;

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const [{ createWorker }, { default: tesseractEnglish }] = await Promise.all([
        import("tesseract.js"),
        import("@tesseract.js-data/eng"),
      ]);
      const worker = await createWorker("eng", 1, {
        langPath: tesseractEnglish.langPath,
        gzip: tesseractEnglish.gzip,
      });
      return worker as OcrWorkerLike;
    })().catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

async function extractImageTextWithTesseract(image: Buffer) {
  try {
    const worker = await getOcrWorker();
    const result = await worker.recognize(image);
    return String(result.data?.text || "")
      .split(/\r?\n/)
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean)
      .join("\n");
  } catch (error) {
    console.warn("[project-requirements] tesseract OCR failed", error);
    return "";
  }
}

async function renderPdfPagesToImages(buffer: Buffer, maxPages = SCANNED_PDF_OCR_PAGE_LIMIT) {
  try {
    const canvasModuleName = ["@napi-rs", "canvas"].join("/");
    const canvasModule = require(canvasModuleName) as {
      createCanvas: (width: number, height: number) => { getContext: (kind: string) => unknown; toBuffer: (mimeType: string) => Buffer };
      DOMMatrix: unknown;
      ImageData: unknown;
      Path2D: unknown;
    };
    if (!(globalThis as any).DOMMatrix) (globalThis as any).DOMMatrix = canvasModule.DOMMatrix;
    if (!(globalThis as any).ImageData) (globalThis as any).ImageData = canvasModule.ImageData;
    if (!(globalThis as any).Path2D) (globalThis as any).Path2D = canvasModule.Path2D;

    const pdfjs = await importPdfJsModule();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false,
    } as any);
    const pdf = await loadingTask.promise;

    try {
      const images: Buffer[] = [];
      const pageLimit = Math.min(pdf.numPages, maxPages);
      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = canvasModule.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        await page.render({ canvasContext: context as any, viewport } as any).promise;
        images.push(canvas.toBuffer("image/png"));
      }
      return images;
    } finally {
      await pdf.destroy();
    }
  } catch (error) {
    console.warn("[project-requirements] scanned PDF rasterization failed", error);
    return [];
  }
}

function looksLikeUsefulPdfText(text: string) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length < 40) return false;
  const alphaNumeric = (normalized.match(/[A-Za-z0-9]/g) || []).length;
  const weird = (normalized.match(/[^\x09\x0A\x0D\x20-\x7E]/g) || []).length;
  const wordLike = (normalized.match(/\b[A-Za-z]{2,}\b/g) || []).length;
  return alphaNumeric / normalized.length > 0.55 && weird / normalized.length < 0.02 && wordLike >= 6;
}

async function extractPdfText(buffer: Buffer) {
  const textLayer = await extractPdfTextLayer(buffer);
  if (textLayer && looksLikeUsefulPdfText(textLayer)) return textLayer;

  const scannedPageImages = await renderPdfPagesToImages(buffer);
  if (scannedPageImages.length > 0) {
    const ocrText = normalizeWhitespace((await Promise.all(scannedPageImages.map((image) => extractImageTextWithTesseract(image)))).join("\n"));
    if (ocrText) return ocrText;
  }

  return textLayer;
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

async function extractImageTextWithSwiftVision(buffer: Buffer, mimeType?: string | null, title?: string | null) {
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

async function extractImageText(buffer: Buffer, mimeType?: string | null, title?: string | null) {
  const swiftVisionText = await extractImageTextWithSwiftVision(buffer, mimeType, title);
  if (swiftVisionText) return swiftVisionText;
  return extractImageTextWithTesseract(buffer);
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

function sentenceImpliesAllChoicesRequired(sentence: string) {
  const value = sentence.toLowerCase();
  if (/\b(use either|either .* or .*|one of|allowed|can use|may use)\b/.test(value)) return false;
  if (/\b(?:tech stack|stack|framework|frontend stack|backend stack)\s*:/i.test(sentence)) return true;
  return /\+|\bplus\b|\band\b/i.test(sentence);
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

  const choiceText = choices.map((choice) => [choice, `${choice.label} ${choice.aliases.join(" ")}`.toLowerCase()] as const);
  const loweredSentence = sentence.toLowerCase();
  const forbiddenChoices = dedupeChoices(choiceText
    .filter(([, aliases]) => {
      const tokens = aliases.split(/\s+/).filter(Boolean);
      return tokens.some((token) => new RegExp(`\\b(?:not|instead of|rather than|avoid|never use|must not use)\\s+${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(loweredSentence));
    })
    .map(([choice]) => choice));
  const requiredChoices = dedupeChoices(choices.filter((choice) => !forbiddenChoices.some((forbidden) => forbidden.slug === choice.slug)));

  const parsed: ParsedSentenceRequirement[] = [];
  const pushGroupedRequirement = (groupedChoices: RequirementChoice[], directive: RequirementDirective) => {
    if (!groupedChoices.length) return;
    const byKind = new Map<RequirementSignalKind, RequirementChoice[]>();
    for (const choice of groupedChoices) {
      const list = byKind.get(choice.kind) || [];
      list.push(choice);
      byKind.set(choice.kind, list);
    }

    for (const [kind, kindChoices] of byKind.entries()) {
      parsed.push({
        requirement: {
          directive,
          kind,
          rationale: sentence,
          choices: dedupeChoices(kindChoices),
          sourceTitles: [sourceTitle],
        },
        source: {
          title: sourceTitle,
          type: sourceType,
          evidence: [sentence],
        },
      });
    }
  };

  if (forbiddenChoices.length > 0) {
    if (requiredChoices.length > 0) {
      if (sentenceImpliesAllChoicesRequired(sentence)) {
        for (const choice of requiredChoices) pushGroupedRequirement([choice], "required");
      } else {
        pushGroupedRequirement(requiredChoices, requiredChoices.length > 1 ? "allowed" : "required");
      }
    }
    pushGroupedRequirement(forbiddenChoices, "forbidden");
    return parsed;
  }

  const directive = detectDirective(sentence);
  const effectiveDirective = directive || (sentenceImpliesAllChoicesRequired(sentence) ? "required" : choices.length > 1 ? "allowed" : "required");
  if (effectiveDirective === "required" && choices.length > 1 && sentenceImpliesAllChoicesRequired(sentence)) {
    for (const choice of choices) pushGroupedRequirement([choice], "required");
    return parsed;
  }
  pushGroupedRequirement(choices, effectiveDirective);
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
    { title: "Project summary", type: "intake", text: normalizeSourceText(input.intakeSummary) },
    { title: "Project goals", type: "intake", text: normalizeSourceText(input.intakeGoals) },
    ...(input.documents || []).map((document) => ({ title: document.title, type: document.type, text: normalizeSourceText(document.text) })),
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
    .map((value) => normalizeSourceText(value))
    .filter((value) => value.trim().length > 0);

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

export async function extractAttachmentTextForTesting(input: { buffer: Buffer; mimeType?: string | null; title?: string | null }) {
  return extractTextFromBuffer(input.buffer, input.mimeType, input.title);
}

export async function terminateAttachmentOcrWorkerForTesting() {
  const workerPromise = ocrWorkerPromise;
  ocrWorkerPromise = null;
  if (!workerPromise) return;
  const worker = await workerPromise.catch(() => null);
  await worker?.terminate().catch(() => undefined);
}

function resolveGithubRepoUrl(project: ProjectLikeWithRequirements) {
  return project.github_repo_binding?.url || project.links?.github || null;
}

function getRepoSlugFromUrl(url: string | null) {
  const normalized = String(url || "").trim().replace(/\.git$/i, "");
  const match = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)$/i);
  return match ? match[2] : null;
}

function firstAbsolutePath(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (!value) continue;
    const trimmed = String(value).trim();
    if (!trimmed) continue;
    if (path.isAbsolute(trimmed)) return trimmed;
  }
  return null;
}

function deriveOpenClawRootFromAbsolutePath(sourcePath: string | null) {
  if (!sourcePath) return null;
  const normalized = path.resolve(sourcePath);
  const marker = `${path.sep}.openclaw`;
  const index = normalized.indexOf(marker);
  if (index >= 0) return normalized.slice(0, index + marker.length);
  if (path.basename(normalized) === ".openclaw") return normalized;
  return null;
}

function resolveOpenClawRoot() {
  const explicitRoot = firstAbsolutePath(process.env.OPENCLAW_ROOT);
  if (explicitRoot) return explicitRoot;

  const homeRoot = firstAbsolutePath(process.env.HOME, os.homedir());
  if (homeRoot) return path.join(homeRoot, ".openclaw");

  const derivedRoot = deriveOpenClawRootFromAbsolutePath(firstAbsolutePath(process.cwd(), currentModuleDir));
  if (derivedRoot) return derivedRoot;

  return path.join(os.tmpdir(), ".openclaw");
}

export function resolveRepoWorkspacePath(project: ProjectLikeWithRequirements) {
  const repoSlug = getRepoSlugFromUrl(resolveGithubRepoUrl(project));
  if (!repoSlug) return null;

  const openClawRoot = resolveOpenClawRoot();
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

function inspectRemoteRepoFrameworks(repoUrl: string | null) {
  const emptyDetection = {
    detectedFrameworks: [] as string[],
    detectedLanguages: [] as string[],
    detectedStyling: [] as string[],
    detectedBackends: [] as string[],
    detectedRuntimes: [] as string[],
    detectedTooling: [] as string[],
    detectedDatabases: [] as string[],
  };

  if (!repoUrl) return { ...emptyDetection, notes: ["No GitHub repo URL found for remote inspection."] };

  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) return { ...emptyDetection, notes: ["No GitHub repo URL found for remote inspection."] };

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccv1-remote-repo-inspect-"));
  const packageJsonPath = path.join(tempDir, "package.json");
  const token = getGitHubToken();
  const curlArgs = [
    "-L",
    "-H", "Accept: application/vnd.github.raw+json",
    "-H", "X-GitHub-Api-Version: 2022-11-28",
    "-H", "User-Agent: command-center-v1-requirements",
  ];

  if (token) {
    curlArgs.push("-H", `Authorization: Bearer ${token}`);
  }

  curlArgs.push(
    "-o", packageJsonPath,
    "-w", "%{http_code}",
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/package.json`
  );

  try {
    const fetchResult = spawnSync("curl", curlArgs, { encoding: "utf8", timeout: 30000 });
    const httpCode = String(fetchResult.stdout || "").trim();

    if (fetchResult.status !== 0) {
      const stderr = String(fetchResult.stderr || fetchResult.stdout || "").trim();
      return { ...emptyDetection, notes: [`Remote repo inspection unavailable: ${stderr || "curl failed"}`] };
    }

    if (!/^2\d\d$/.test(httpCode)) {
      const stderr = String(fetchResult.stderr || "").trim();
      return { ...emptyDetection, notes: [`Remote repo inspection unavailable: GitHub returned HTTP ${httpCode}${stderr ? ` (${stderr})` : ""}`] };
    }

    return inspectRepoFrameworks(tempDir, "remote");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function inspectRepoFrameworks(repoWorkspacePath: string | null, source: "local" | "remote" = "local") {
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
      notes: [source === "remote" ? `Inspected remote repo package.json (${packageJsonPath})` : `Inspected ${packageJsonPath}`],
    };
  } catch (error) {
    return {
      ...emptyDetection,
      notes: [error instanceof Error ? error.message : "Failed to parse package.json"],
    };
  }
}

function repoSignalsFromInspection(project: ProjectLikeWithRequirements, repoWorkspacePath: string | null): RepoSignals & { notes: string[] } {
  const inspected = repoWorkspacePath
    ? inspectRepoFrameworks(repoWorkspacePath, "local")
    : inspectRemoteRepoFrameworks(resolveGithubRepoUrl(project));
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
  const inspected = repoSignalsFromInspection(project, repoWorkspacePath);
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

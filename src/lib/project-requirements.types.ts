export type RequirementSource = {
  title: string;
  type: string;
  evidence: string[];
};

export type RequirementSignalKind = "framework" | "language" | "styling" | "backend" | "runtime" | "tooling" | "database" | "platform" | "other";
export type RequirementDirective = "required" | "allowed" | "forbidden";

export type RequirementChoice = {
  slug: string;
  label: string;
  aliases: string[];
  kind: RequirementSignalKind;
};

export type TechnologyRequirement = {
  directive: RequirementDirective;
  kind: RequirementSignalKind;
  rationale: string;
  choices: RequirementChoice[];
  sourceTitles: string[];
};

export type ProjectRequirements = {
  derivedAt: string;
  summary: string[];
  constraints: string[];
  requiredFrameworks: string[];
  sourceCount: number;
  sources: RequirementSource[];
  technologyRequirements: TechnologyRequirement[];
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
  detectedLanguages: string[];
  detectedStyling: string[];
  detectedBackends: string[];
  detectedRuntimes: string[];
  detectedTooling: string[];
  detectedDatabases: string[];
  violations: string[];
  notes: string[];
};

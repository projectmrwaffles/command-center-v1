import { sanitizeProjectLinks, type ProjectLinks } from "@/lib/project-links";

export type ReviewRequestContext = {
  sprintId: string;
  sprintName: string;
  projectId: string;
  projectName: string;
  links: ProjectLinks | null;
  note: string | null;
};

export function mergeProjectLinks(existing: unknown, incoming: unknown): ProjectLinks | null {
  const base = sanitizeProjectLinks(existing) || {};
  const next = sanitizeProjectLinks(incoming) || {};
  const merged = { ...base, ...next };
  return Object.keys(merged).length > 0 ? merged : null;
}

export function buildReviewRequestSummary(input: { projectName: string; sprintName: string }) {
  return `Review ${input.sprintName} for ${input.projectName}`;
}

export function buildReviewRequestContext(input: ReviewRequestContext) {
  return {
    kind: "project_phase_review",
    sprint_id: input.sprintId,
    sprint_name: input.sprintName,
    project_id: input.projectId,
    project_name: input.projectName,
    links: input.links,
    note: input.note,
  };
}

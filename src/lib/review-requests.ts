import { sanitizeProjectLinks, type ProjectLinks } from "@/lib/project-links";

export type ReviewArtifact = {
  kind: "workspace_file" | "git_commit";
  label: string;
  value: string;
  sourceTaskId?: string;
  sourceTaskTitle?: string;
};

export type ReviewRequestContext = {
  sprintId: string;
  sprintName: string;
  projectId: string;
  projectName: string;
  links: ProjectLinks | null;
  note: string | null;
  artifacts?: ReviewArtifact[] | null;
};

export function mergeProjectLinks(existing: unknown, incoming: unknown): ProjectLinks | null {
  const base = sanitizeProjectLinks(existing) || {};
  const next = sanitizeProjectLinks(incoming) || {};
  const merged = { ...base, ...next };
  return Object.keys(merged).length > 0 ? merged : null;
}

function extractBacktickedValues(text?: string | null) {
  if (!text) return [] as string[];
  return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]?.trim()).filter(Boolean) as string[];
}

function normalizeWorkspacePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed.includes("/")) return null;
  if (/^https?:\/\//i.test(trimmed)) return null;
  if (/\s{2,}/.test(trimmed)) return null;
  if (/[\*\{\}]/.test(trimmed)) return null;
  if (!/\.(png|jpe?g|gif|webp|pdf|mp4|mov|txt|md|json)$/i.test(trimmed)) return null;
  return trimmed;
}

function normalizeCommit(value: string) {
  const trimmed = value.trim();
  return /^[0-9a-f]{7,40}$/i.test(trimmed) ? trimmed : null;
}

export function deriveReviewArtifacts(input: {
  reviewTasks?: Array<{ id: string; title?: string | null }>;
  completionEvents?: Array<{ payload?: Record<string, unknown> | null }>;
}) {
  const taskMeta = new Map((input.reviewTasks || []).map((task) => [task.id, task]));
  const artifacts: ReviewArtifact[] = [];
  const seen = new Set<string>();

  for (const event of input.completionEvents || []) {
    const payload = event.payload || {};
    const taskId = typeof payload.task_id === "string" ? payload.task_id : undefined;
    if (taskId && taskMeta.size > 0 && !taskMeta.has(taskId)) continue;

    const task = taskId ? taskMeta.get(taskId) : undefined;
    const sourceTaskTitle = task?.title || (typeof payload.title === "string" ? payload.title : undefined);
    const rawResult = typeof payload.raw_result === "string" ? payload.raw_result : "";
    const message = typeof payload.message === "string" ? payload.message : "";
    const values = [...extractBacktickedValues(rawResult), ...extractBacktickedValues(message)];

    for (const value of values) {
      const workspacePath = normalizeWorkspacePath(value);
      if (workspacePath) {
        const dedupeKey = `workspace_file:${workspacePath}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          const segments = workspacePath.split("/");
          artifacts.push({
            kind: "workspace_file",
            label: segments[segments.length - 1] || workspacePath,
            value: workspacePath,
            sourceTaskId: taskId,
            sourceTaskTitle,
          });
        }
        continue;
      }

      const commit = normalizeCommit(value);
      if (commit) {
        const dedupeKey = `git_commit:${commit}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          artifacts.push({
            kind: "git_commit",
            label: `Commit ${commit.slice(0, 7)}`,
            value: commit,
            sourceTaskId: taskId,
            sourceTaskTitle,
          });
        }
      }
    }
  }

  return artifacts;
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
    artifacts: input.artifacts || null,
  };
}

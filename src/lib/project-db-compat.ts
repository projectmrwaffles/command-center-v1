import type { GitHubRepoBinding } from "./github-repo-binding";

export type ProjectDbCompatRow = {
  id?: string;
  name?: string | null;
  type?: string | null;
  status?: string | null;
  intake?: any;
  links?: Record<string, string> | null;
  github_repo_binding?: GitHubRepoBinding | null;
};

type DbClient = {
  from: (table: string) => any;
};

type DbErrorLike = { code?: string; message?: string } | null | undefined;

function isMissingColumnError(error: DbErrorLike, column: string, table?: string) {
  if (!error?.message) return false;
  return (
    ((error.code === "PGRST204" || error.code === "42703") && error.message.includes(column)) ||
    error.message.includes(`'${column}' column`) ||
    (table ? error.message.includes(`column ${table}.${column} does not exist`) : false)
  );
}

function areMissingColumns(error: DbErrorLike, columns: string[], table?: string) {
  return columns.some((column) => isMissingColumnError(error, column, table));
}

export function isMissingGithubRepoBindingColumnError(error: DbErrorLike) {
  return isMissingColumnError(error, "github_repo_binding", "projects");
}

export function isMissingLinksColumnError(error: DbErrorLike) {
  return isMissingColumnError(error, "links", "projects");
}

export async function selectProjectSummaryTasksWithCompat(db: DbClient, projectIds: string[]) {
  const fullSelect = "project_id, sprint_id, status, task_type, task_metadata";
  const fallbackSelect = "project_id, sprint_id, status";

  const first = await db.from("sprint_items").select(fullSelect).in("project_id", projectIds);
  if (!areMissingColumns(first.error, ["task_type", "task_metadata"], "sprint_items")) {
    return first;
  }

  const fallback = await db.from("sprint_items").select(fallbackSelect).in("project_id", projectIds);
  return {
    ...fallback,
    data: (fallback.data ?? []).map((task: any) => ({ ...task, task_type: null, task_metadata: null })),
  };
}

export async function selectProjectSummarySprintsWithCompat(db: DbClient, projectIds: string[]) {
  const fullSelect = "id, project_id, auto_generated, phase_key, approval_gate_required, approval_gate_status";
  const fallbackSelect = "id, project_id";

  const first = await db.from("sprints").select(fullSelect).in("project_id", projectIds);
  if (!areMissingColumns(first.error, ["auto_generated", "phase_key", "approval_gate_required", "approval_gate_status"], "sprints")) {
    return first;
  }

  const fallback = await db.from("sprints").select(fallbackSelect).in("project_id", projectIds);
  return {
    ...fallback,
    data: (fallback.data ?? []).map((sprint: any) => ({
      ...sprint,
      auto_generated: null,
      phase_key: null,
      approval_gate_required: false,
      approval_gate_status: "not_requested",
    })),
  };
}

export async function selectProjectWithArtifactCompat(
  db: DbClient,
  projectId: string,
  baseColumns: string,
) {
  const withAll = `${baseColumns}, links, github_repo_binding`;
  const withoutBinding = `${baseColumns}, links`;
  const withoutArtifacts = baseColumns;

  const first = await db.from("projects").select(withAll).eq("id", projectId).single();
  if (!isMissingGithubRepoBindingColumnError(first.error) && !isMissingLinksColumnError(first.error)) {
    return first;
  }

  if (isMissingGithubRepoBindingColumnError(first.error)) {
    const second = await db.from("projects").select(withoutBinding).eq("id", projectId).single();
    if (!isMissingLinksColumnError(second.error)) {
      return {
        ...second,
        data: second.data ? { ...second.data, github_repo_binding: null } : second.data,
      };
    }
  }

  const fallback = await db.from("projects").select(withoutArtifacts).eq("id", projectId).single();
  return {
    ...fallback,
    data: fallback.data ? { ...fallback.data, links: null, github_repo_binding: null } : fallback.data,
  };
}

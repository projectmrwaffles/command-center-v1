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

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, column: string) {
  if (!error?.message) return false;
  return (
    ((error.code === "PGRST204" || error.code === "42703") && error.message.includes(column)) ||
    error.message.includes(`'${column}' column`) ||
    error.message.includes(`column projects.${column} does not exist`)
  );
}

export function isMissingGithubRepoBindingColumnError(error: { code?: string; message?: string } | null | undefined) {
  return isMissingColumnError(error, "github_repo_binding");
}

export function isMissingLinksColumnError(error: { code?: string; message?: string } | null | undefined) {
  return isMissingColumnError(error, "links");
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

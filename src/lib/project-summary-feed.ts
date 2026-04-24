import { createRouteHandlerClient, createServerClient } from "@/lib/supabase-server";
import {
  filterLegacyAttachmentShellState,
} from "@/lib/project-attachment-finalize";
import {
  selectProjectSummaryJobsWithCompat,
  selectProjectSummarySprintsWithCompat,
  selectProjectSummaryTasksWithCompat,
  selectProjectsListWithCompat,
} from "@/lib/project-db-compat";
import { buildProjectTruthIndex } from "@/lib/project-summary-truth";

type DbClient = ReturnType<typeof createRouteHandlerClient> | ReturnType<typeof createServerClient>;

type ProjectSummaryFeedOptions = {
  type?: string | null;
  useRouteHandlerClient?: boolean;
  ttlMs?: number;
};

type ProjectSummaryFeedResult = {
  projects: any[];
  error: string | null;
  status?: number;
};

type CacheEntry = {
  expiresAt: number;
  value?: ProjectSummaryFeedResult;
  promise?: Promise<ProjectSummaryFeedResult>;
};

const DEFAULT_TTL_MS = 5000;
const summaryFeedCache = new Map<string, CacheEntry>();

function getCacheKey(options: ProjectSummaryFeedOptions) {
  return JSON.stringify({
    type: options.type ?? null,
    useRouteHandlerClient: Boolean(options.useRouteHandlerClient),
  });
}

async function fetchProjectSummaryFeedUncached(options: ProjectSummaryFeedOptions): Promise<ProjectSummaryFeedResult> {
  const db = options.useRouteHandlerClient ? createRouteHandlerClient() : createServerClient();
  if (!db) {
    return { projects: [], error: "Database not configured", status: 503 };
  }

  const initial = await selectProjectsListWithCompat(db, options.type);
  const projects: any[] = initial.data ?? [];
  if (initial.error) {
    return { projects: [], error: initial.error.message, status: 500 };
  }

  const projectIds = projects.map((project) => project.id).filter(Boolean);
  if (projectIds.length === 0) {
    return { projects, error: null };
  }

  const [{ data: tasks, error: tasksError }, { data: sprints, error: sprintsError }, { data: jobs, error: jobsError }] = await Promise.all([
    selectProjectSummaryTasksWithCompat(db, projectIds),
    selectProjectSummarySprintsWithCompat(db, projectIds),
    selectProjectSummaryJobsWithCompat(db, projectIds),
  ]);

  if (tasksError || sprintsError || jobsError) {
    return {
      projects: [],
      error: tasksError?.message || sprintsError?.message || jobsError?.message || "Failed to resolve project progress truth",
      status: 500,
    };
  }

  const visibleTasks: any[] = [];
  const visibleSprints: any[] = [];
  for (const project of projects) {
    const filtered = filterLegacyAttachmentShellState({
      sprints: (sprints ?? []).filter((sprint: any) => sprint.project_id === project.id),
      tasks: (tasks ?? []).filter((task: any) => task.project_id === project.id),
    });
    visibleSprints.push(...filtered.sprints);
    visibleTasks.push(...filtered.tasks);
  }

  const projectTruthById = buildProjectTruthIndex({
    projects,
    tasks: visibleTasks,
    sprints: visibleSprints,
    jobs: jobs ?? [],
  });

  return {
    error: null,
    projects: projects.map((project) => ({
      ...project,
      progress_pct: projectTruthById.get(project.id)?.progressPct ?? project.progress_pct ?? 0,
      truth: projectTruthById.get(project.id) ?? null,
    })),
  };
}

export async function loadProjectSummaryFeed(options: ProjectSummaryFeedOptions = {}): Promise<ProjectSummaryFeedResult> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const cacheKey = getCacheKey(options);
  const now = Date.now();
  const cached = summaryFeedCache.get(cacheKey);

  if (cached?.value && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = fetchProjectSummaryFeedUncached(options)
    .then((result) => {
      summaryFeedCache.set(cacheKey, {
        value: result,
        expiresAt: Date.now() + ttlMs,
      });
      return result;
    })
    .catch((error) => {
      summaryFeedCache.delete(cacheKey);
      throw error;
    });

  summaryFeedCache.set(cacheKey, {
    expiresAt: now + ttlMs,
    promise,
  });

  return promise;
}

export function invalidateProjectSummaryFeedCache() {
  summaryFeedCache.clear();
}

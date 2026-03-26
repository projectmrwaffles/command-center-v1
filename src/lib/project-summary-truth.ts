import { getProjectArtifactIntegrity } from "./project-artifact-requirements";

type ProjectRow = {
  id: string;
  status?: string | null;
  type?: string | null;
  intake?: any;
  links?: Record<string, string> | null;
  github_repo_binding?: any;
  progress_pct?: number | null;
  [key: string]: any;
};

type TaskRow = {
  project_id?: string | null;
  sprint_id?: string | null;
  status?: string | null;
  task_type?: string | null;
};

type SprintRow = {
  id: string;
  project_id?: string | null;
  approval_gate_required?: boolean | null;
  approval_gate_status?: string | null;
};

type JobRow = {
  project_id?: string | null;
  status?: string | null;
};

function deriveProjectSummaryTruth(input: {
  project: ProjectRow;
  tasks?: TaskRow[];
  sprints?: SprintRow[];
  jobs?: JobRow[];
}) {
  const tasks = input.tasks ?? [];
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((task) => task.status === "done").length;
  const rawProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : input.project.progress_pct ?? 0;
  const artifactIntegrity = getProjectArtifactIntegrity(input.project, tasks);
  const progressPct = artifactIntegrity.completionCapPct != null && doneTasks === totalTasks && totalTasks > 0
    ? Math.min(rawProgress, artifactIntegrity.completionCapPct)
    : rawProgress;

  return {
    progressPct,
    totalTasks,
    doneTasks,
    blockedJobs: (input.jobs ?? []).filter((job) => job.status === "blocked").length,
    gatedSprintCount: (input.sprints ?? []).filter((sprint) => sprint.approval_gate_required).length,
  };
}

export function buildProjectTruthIndex(input: {
  projects: ProjectRow[];
  tasks?: TaskRow[] | null;
  sprints?: SprintRow[] | null;
  jobs?: JobRow[] | null;
}) {
  const tasksByProject = new Map<string, TaskRow[]>();
  const sprintsByProject = new Map<string, SprintRow[]>();
  const jobsByProject = new Map<string, JobRow[]>();

  for (const task of input.tasks || []) {
    if (!task?.project_id) continue;
    const bucket = tasksByProject.get(task.project_id) ?? [];
    bucket.push(task);
    tasksByProject.set(task.project_id, bucket);
  }

  for (const sprint of input.sprints || []) {
    if (!sprint?.project_id) continue;
    const bucket = sprintsByProject.get(sprint.project_id) ?? [];
    bucket.push(sprint);
    sprintsByProject.set(sprint.project_id, bucket);
  }

  for (const job of input.jobs || []) {
    if (!job?.project_id) continue;
    const bucket = jobsByProject.get(job.project_id) ?? [];
    bucket.push(job);
    jobsByProject.set(job.project_id, bucket);
  }

  return new Map(
    input.projects.map((project) => [
      project.id,
      deriveProjectSummaryTruth({
        project,
        tasks: tasksByProject.get(project.id) ?? [],
        sprints: sprintsByProject.get(project.id) ?? [],
        jobs: jobsByProject.get(project.id) ?? [],
      }),
    ]),
  );
}

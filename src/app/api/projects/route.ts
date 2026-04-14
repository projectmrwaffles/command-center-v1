import { createRouteHandlerClient } from "@/lib/supabase-server";
import { type GitHubRepoProvisioningState, type ProjectIntake } from "@/lib/project-intake";
import { finalizeProjectCreate, resolveAutoRouteTeamIds } from "@/lib/project-create-finalize";
import { buildAttachmentKickoffWaitingIntake, filterLegacyAttachmentShellState, shouldFinalizeAttachmentProjectNow, shouldInitializeAttachmentWorkflow } from "@/lib/project-attachment-finalize";
import { sanitizeProjectLinks } from "@/lib/project-links";
import { reconcileAttachmentBackedProjectCreate } from "@/lib/project-requirements-repair";
import { createGitHubRepoBinding, getGitHubRepoUrlFromProjectArtifacts, getGitHubRepoValidationError, getNetNewGitHubRepoGuardError, githubProvisioningAvailable, syncProjectLinksWithGitHubBinding, type GitHubRepoBindingInput } from "@/lib/github-repo-binding";
import { getGitHubProvisioningReadiness, provisionGitHubRepoForProject, shouldAutoProvisionGitHubRepo } from "@/lib/github-provisioning";
import { isMissingGithubRepoBindingColumnError, isMissingLinksColumnError, selectProjectSummaryJobsWithCompat, selectProjectSummarySprintsWithCompat, selectProjectSummaryTasksWithCompat, selectProjectsListWithCompat, selectProjectWithArtifactCompat } from "@/lib/project-db-compat";
import { buildProjectTruthIndex } from "@/lib/project-summary-truth";
import { authorizeApiRequest } from "@/lib/server-auth";
import { NextRequest, NextResponse } from "next/server";

function estimateWorkloadFromTeams(teamIds: string[]): {
  complexity: string;
  hours: number;
  reasoning: string;
} {
  if (teamIds.length === 0) {
    return { complexity: "low", hours: 0.25, reasoning: "No teams assigned" };
  }

  const teamMinutes = teamIds.map((id) => TEAM_BASE_MINUTES[id] || 15);
  const maxTeamMinutes = Math.max(...teamMinutes);
  const totalMinutes = Math.ceil(maxTeamMinutes * 1.3);
  const hours = Math.round((totalMinutes / 60) * 10) / 10;
  const complexity = teamIds.length > 3 ? "high" : teamIds.length > 1 ? "medium" : "low";

  return {
    complexity,
    hours: Math.max(0.25, hours),
    reasoning: `${teamIds.length} AI agents parallel, ~${totalMinutes}min each + 30% buffer`,
  };
}

const TEAM_BASE_MINUTES: Record<string, number> = {
  ["11111111-1111-1111-1111-000000000001"]: 30,
  ["11111111-1111-1111-1111-000000000002"]: 20,
  ["11111111-1111-1111-1111-000000000003"]: 15,
  ["11111111-1111-1111-1111-000000000004"]: 15,
  ["11111111-1111-1111-1111-000000000005"]: 20,
};

export async function GET(req: NextRequest) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const initial = await selectProjectsListWithCompat(db, type);
    let projects: any[] = initial.data ?? [];
    let error = initial.error;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let projectIds = projects.map((project) => project.id).filter(Boolean);
    if (projectIds.length === 0) {
      return NextResponse.json({ projects });
    }

    let [{ data: tasks, error: tasksError }, { data: sprints, error: sprintsError }, { data: jobs, error: jobsError }] = await Promise.all([
      selectProjectSummaryTasksWithCompat(db, projectIds),
      selectProjectSummarySprintsWithCompat(db, projectIds),
      selectProjectSummaryJobsWithCompat(db, projectIds),
    ]);

    if (tasksError || sprintsError || jobsError) {
      return NextResponse.json({ error: tasksError?.message || sprintsError?.message || jobsError?.message || "Failed to resolve project progress truth" }, { status: 500 });
    }

    const sprintCountByProjectId = new Map<string, number>();
    const allSprintsAreAttachmentShellByProjectId = new Map<string, boolean>();
    for (const sprint of sprints ?? []) {
      const projectId = typeof sprint?.project_id === "string" ? sprint.project_id : null;
      if (!projectId) continue;
      sprintCountByProjectId.set(projectId, (sprintCountByProjectId.get(projectId) || 0) + 1);
      const currentAllShell = allSprintsAreAttachmentShellByProjectId.get(projectId);
      const sprintName = typeof sprint?.name === "string" ? sprint.name : null;
      const isAttachmentShell = sprintName?.trim().toLowerCase() === "attachment intake";
      allSprintsAreAttachmentShellByProjectId.set(projectId, currentAllShell === undefined ? Boolean(isAttachmentShell) : currentAllShell && Boolean(isAttachmentShell));
    }

    const candidateProjectIds = projectIds.filter((projectId) => {
      const sprintCount = sprintCountByProjectId.get(projectId) || 0;
      return sprintCount === 0 || allSprintsAreAttachmentShellByProjectId.get(projectId) === true;
    });
    let attachmentProjectsReconciled = false;

    for (const projectId of candidateProjectIds) {
      const { data: candidateProject, error: candidateError } = await selectProjectWithArtifactCompat(
        db,
        projectId,
        "id, name, type, team_id, intake"
      );

      if (candidateError || !candidateProject) continue;

      const reconciled = await reconcileAttachmentBackedProjectCreate(db as any, {
        project: {
          ...candidateProject,
          intake: candidateProject.intake || null,
          links: candidateProject.links || null,
          github_repo_binding: candidateProject.github_repo_binding || null,
        },
      });

      if (reconciled.repaired || reconciled.finalized) {
        attachmentProjectsReconciled = true;
      }
    }

    if (attachmentProjectsReconciled) {
      const refreshed = await selectProjectsListWithCompat(db, type);
      projects = refreshed.data ?? projects;
      error = refreshed.error ?? error;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      projectIds = projects.map((project) => project.id).filter(Boolean);
      [{ data: tasks, error: tasksError }, { data: sprints, error: sprintsError }, { data: jobs, error: jobsError }] = await Promise.all([
        selectProjectSummaryTasksWithCompat(db, projectIds),
        selectProjectSummarySprintsWithCompat(db, projectIds),
        selectProjectSummaryJobsWithCompat(db, projectIds),
      ]);

      if (tasksError || sprintsError || jobsError) {
        return NextResponse.json({ error: tasksError?.message || sprintsError?.message || jobsError?.message || "Failed to resolve project progress truth" }, { status: 500 });
      }
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

    return NextResponse.json({
      projects: projects.map((project) => ({
        ...project,
        progress_pct: projectTruthById.get(project.id)?.progressPct ?? project.progress_pct ?? 0,
        truth: projectTruthById.get(project.id) ?? null,
      })),
    });
  } catch (e: unknown) {
    console.error("[API /projects GET] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function stripCallerProvisioningState(intake?: ProjectIntake) {
  if (!intake) return intake;

  const sanitizedIntake = { ...intake } as ProjectIntake & { attachmentKickoffState?: unknown };
  delete sanitizedIntake.githubRepoProvisioning;
  delete sanitizedIntake.attachmentKickoffState;
  return sanitizedIntake;
}

export async function POST(req: NextRequest) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;
    const body = await req.json();
    const { name, type, teamId, description, intake, links, githubRepo, provisionGithubRepo, confirmLinkedRepoForNetNew, hasAttachments } = body as {
      name?: string;
      type?: string;
      teamId?: string;
      description?: string;
      intake?: ProjectIntake;
      links?: Record<string, string>;
      githubRepo?: GitHubRepoBindingInput;
      provisionGithubRepo?: boolean;
      confirmLinkedRepoForNetNew?: boolean;
      hasAttachments?: boolean;
    };
    const sanitizedIntakeBase = stripCallerProvisioningState(intake);
    const { deriveProjectRequirements } = await import("@/lib/project-requirements");
    const sanitizedIntake = sanitizedIntakeBase
      ? {
          ...sanitizedIntakeBase,
          requirements: deriveProjectRequirements({
            intakeSummary: sanitizedIntakeBase.summary,
            intakeGoals: sanitizedIntakeBase.goals,
            existing: sanitizedIntakeBase.requirements,
          }),
        }
      : sanitizedIntakeBase;

    if (!name || !type) {
      return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const githubRepoUrl = getGitHubRepoUrlFromProjectArtifacts({ githubRepo, links, intakeLinks: sanitizedIntake?.links });
    const githubRepoError = getGitHubRepoValidationError(githubRepoUrl);
    if (githubRepoError) {
      return NextResponse.json({ error: githubRepoError }, { status: 400 });
    }

    const netNewGitHubRepoGuardError = getNetNewGitHubRepoGuardError({
      projectOrigin: sanitizedIntake?.projectOrigin,
      githubRepoUrl,
      confirmLinkedRepo: confirmLinkedRepoForNetNew,
    });
    if (netNewGitHubRepoGuardError) {
      return NextResponse.json({ error: netNewGitHubRepoGuardError }, { status: 400 });
    }

    const shouldProvisionGithubRepo = shouldAutoProvisionGitHubRepo({
      type,
      intake: sanitizedIntake,
      existingGitHubUrl: githubRepoUrl,
      provisionGithubRepo,
    });

    if (shouldProvisionGithubRepo && !githubProvisioningAvailable()) {
      return NextResponse.json({ error: "GitHub repo provisioning is not available in this environment yet. Link an existing repo for now." }, { status: 501 });
    }

    const provisioningReadiness = getGitHubProvisioningReadiness({
      type,
      intake: sanitizedIntake,
      existingGitHubUrl: githubRepoUrl,
      provisionGithubRepo,
    });

    if (!provisioningReadiness.ok) {
      return NextResponse.json({
        error: provisioningReadiness.error,
        code: provisioningReadiness.code,
        details: provisioningReadiness.nextAction,
      }, { status: 412 });
    }

    const githubBinding = createGitHubRepoBinding({
      url: githubRepoUrl,
      source: shouldProvisionGithubRepo ? "provisioned" : "linked",
      ...githubRepo,
    });
    let provisioningState: GitHubRepoProvisioningState | undefined = shouldProvisionGithubRepo
      ? {
          status: "pending" as const,
          reason: "GitHub repo auto-provisioning has been queued for this net-new code-heavy project.",
          attemptedAt: new Date().toISOString(),
          nextAction: undefined,
        }
      : undefined;
    let sanitizedLinks = syncProjectLinksWithGitHubBinding(sanitizeProjectLinks(links || sanitizedIntake?.links), githubBinding);
    const autoTeamIds = resolveAutoRouteTeamIds(type, sanitizedIntake, teamId);
    const primaryTeamId = autoTeamIds[0];

    const workload = estimateWorkloadFromTeams(autoTeamIds);
    console.log(`[Workload Analysis] ${name}: ${workload.hours}h (${workload.complexity}) - ${workload.reasoning}`);

    const projectInsertBase = {
      name,
      type,
      team_id: primaryTeamId,
      description: description || null,
      intake: sanitizedIntake ? { ...sanitizedIntake, ...(provisioningState ? { githubRepoProvisioning: provisioningState } : {}) } : (provisioningState ? { githubRepoProvisioning: provisioningState } : null),
      intake_summary: sanitizedIntake?.summary || null,
      status: "active",
      progress_pct: 0,
      github_repo_binding: githubBinding,
    };

    let project: any = null;
    let error: { message: string; code?: string } | null = null;
    let warning: { code: string; message: string; details?: string } | null = null;

    const firstInsert = await db.from("projects").insert({ ...projectInsertBase, links: sanitizedLinks }).select().single();
    project = firstInsert.data;
    error = firstInsert.error;

    if (isMissingGithubRepoBindingColumnError(error)) {
      const retryWithoutBinding = await db.from("projects").insert({ ...projectInsertBase, github_repo_binding: undefined, links: sanitizedLinks }).select().single();
      project = retryWithoutBinding.data;
      error = retryWithoutBinding.error;
    }

    if (isMissingLinksColumnError(error)) {
      const fallbackInsert = await db.from("projects").insert({ ...projectInsertBase, github_repo_binding: undefined }).select().single();
      project = fallbackInsert.data;
      error = fallbackInsert.error;
    }

    if (error || !project) {
      console.error("[API /projects] insert error:", error);
      return NextResponse.json({ error: error?.message || "Failed to create project", code: error?.code }, { status: 500 });
    }

    if (shouldProvisionGithubRepo && !githubBinding) {
      try {
        const provisionedBinding = await provisionGitHubRepoForProject({
          projectId: project.id,
          projectName: name,
          description: description || sanitizedIntake?.summary || null,
          requirements: sanitizedIntake?.requirements || null,
        });
        sanitizedLinks = syncProjectLinksWithGitHubBinding(sanitizeProjectLinks(links || sanitizedIntake?.links), provisionedBinding);
        provisioningState = {
          status: "ready",
          reason: `GitHub repo ${provisionedBinding.fullName} was provisioned automatically and attached to this project.`,
          attemptedAt: new Date().toISOString(),
          nextAction: undefined,
        };

        const provisioningUpdate = {
          github_repo_binding: provisionedBinding,
          links: sanitizedLinks,
          intake: {
            ...(project.intake || sanitizedIntake || {}),
            githubRepoSource: "provisioned",
            githubRepoProvisioning: provisioningState,
          },
          updated_at: new Date().toISOString(),
        };

        let updatedProject: any = null;
        let updateError: { message: string; code?: string } | null = null;

        const firstUpdate = await db
          .from("projects")
          .update(provisioningUpdate)
          .eq("id", project.id)
          .select()
          .single();
        updatedProject = firstUpdate.data;
        updateError = firstUpdate.error;

        if (updateError && (isMissingGithubRepoBindingColumnError(updateError) || isMissingLinksColumnError(updateError))) {
          const fallbackIntake = {
            ...(project.intake || sanitizedIntake || {}),
            githubRepoSource: "provisioned",
            githubRepoProvisioning: provisioningState,
            links: {
              ...((project.intake || sanitizedIntake || {}).links || {}),
              github: provisionedBinding.url,
            },
          };

          const fallbackUpdate = await db
            .from("projects")
            .update({
              intake: fallbackIntake,
              updated_at: new Date().toISOString(),
            })
            .eq("id", project.id)
            .select()
            .single();

          updatedProject = fallbackUpdate.data
            ? { ...fallbackUpdate.data, links: sanitizedLinks, github_repo_binding: provisionedBinding }
            : fallbackUpdate.data;
          updateError = fallbackUpdate.error;
        }

        if (updateError) {
          throw new Error(updateError.message);
        }

        project = updatedProject ?? {
          ...project,
          github_repo_binding: provisionedBinding,
          links: sanitizedLinks,
          intake: {
            ...(project.intake || sanitizedIntake || {}),
            githubRepoSource: "provisioned",
            githubRepoProvisioning: provisioningState,
          },
        };
      } catch (provisionError) {
        console.error("[API /projects] GitHub provisioning failed:", provisionError);
        const provisionFailureMessage = provisionError instanceof Error ? provisionError.message : "GitHub repo auto-provisioning failed.";
        provisioningState = {
          status: "failed",
          reason: provisionFailureMessage,
          attemptedAt: new Date().toISOString(),
          nextAction: "Verify GITHUB_TOKEN/GH_TOKEN is configured with repo creation access for the server runtime, then retry provisioning or attach an existing GitHub repo manually.",
        };

        const failedIntake = {
          ...(project.intake || sanitizedIntake || {}),
          githubRepoProvisioning: provisioningState,
        };

        const { data: failedProject } = await db
          .from("projects")
          .update({
            intake: failedIntake,
            updated_at: new Date().toISOString(),
          })
          .eq("id", project.id)
          .select()
          .single();

        project = failedProject ?? { ...project, intake: failedIntake };
        warning = {
          code: "GITHUB_PROVISIONING_FAILED",
          message: "Project record was created, but GitHub repo provisioning failed before setup completed.",
          details: [provisionFailureMessage, provisioningState.nextAction].filter(Boolean).join(" "),
        };
      }
    }

    const shouldFinalizeNow = shouldFinalizeAttachmentProjectNow({
      hasAttachments: Boolean(hasAttachments),
      intake: sanitizedIntake || undefined,
    });

    if (shouldInitializeAttachmentWorkflow({ hasAttachments: Boolean(hasAttachments), intake: sanitizedIntake || undefined })) {
      const waitingIntake = buildAttachmentKickoffWaitingIntake(sanitizedIntake || null);
      const { data: waitingProject, error: waitingUpdateError } = await db
        .from("projects")
        .update({
          intake: waitingIntake,
          updated_at: new Date().toISOString(),
        })
        .eq("id", project.id)
        .select()
        .single();

      if (waitingUpdateError) {
        throw new Error(waitingUpdateError.message || "Failed to persist attachment kickoff waiting state");
      }

      project = waitingProject ?? { ...project, intake: waitingIntake };
    }

    const dispatchResults = shouldFinalizeNow
      ? await finalizeProjectCreate(db, {
          project,
          name,
          type,
          intake: sanitizedIntake,
          links: sanitizedLinks,
          githubRepoBinding: project.github_repo_binding || githubBinding || null,
          teamId,
        })
      : [];

    return NextResponse.json({
      project: { ...project, intake: project.intake || sanitizedIntake || null, links: sanitizedLinks, github_repo_binding: project.github_repo_binding || githubBinding || null },
      workload,
      dispatch: {
        attempted: dispatchResults.length,
        dispatched: dispatchResults.filter((result) => result.dispatched).length,
        blocked: dispatchResults.filter((result) => !result.dispatched && result.blocker).length,
        results: dispatchResults,
      },
      warning,
    }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

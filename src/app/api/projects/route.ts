import { createRouteHandlerClient } from "@/lib/supabase-server";
import { type GitHubRepoProvisioningState, type ProjectIntake } from "@/lib/project-intake";
import { finalizeProjectCreate, resolveAutoRouteTeamIds } from "@/lib/project-create-finalize";
import { sanitizeProjectLinks } from "@/lib/project-links";
import { createGitHubRepoBinding, getGitHubRepoUrlFromProjectArtifacts, getGitHubRepoValidationError, getNetNewGitHubRepoGuardError, githubProvisioningAvailable, syncProjectLinksWithGitHubBinding, type GitHubRepoBindingInput } from "@/lib/github-repo-binding";
import { provisionGitHubRepoForProject, shouldAutoProvisionGitHubRepo } from "@/lib/github-provisioning";
import { isMissingGithubRepoBindingColumnError, isMissingLinksColumnError, selectProjectSummarySprintsWithCompat, selectProjectSummaryTasksWithCompat } from "@/lib/project-db-compat";
import { buildProjectTruthIndex } from "@/lib/project-summary-truth";
import { deriveProjectRequirements } from "@/lib/project-requirements";
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

    const selectWithLinks = "id, name, status, type, description, intake_summary, progress_pct, links, created_at, updated_at";
    const selectWithoutLinks = "id, name, status, type, description, intake_summary, progress_pct, created_at, updated_at";

    const runQuery = async (selectClause: string) => {
      let query = db.from("projects").select(selectClause).order("created_at", { ascending: false });
      if (type) query = query.eq("type", type);
      return query;
    };

    const initial = await runQuery(selectWithLinks);
    let projects: any[] = initial.data ?? [];
    let error = initial.error;

    if (isMissingLinksColumnError(error)) {
      const fallback = await runQuery(selectWithoutLinks);
      projects = (fallback.data ?? []).map((project) => ({ ...(project as any), links: null }));
      error = fallback.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const projectIds = projects.map((project) => project.id).filter(Boolean);
    if (projectIds.length === 0) {
      return NextResponse.json({ projects });
    }

    const [{ data: tasks, error: tasksError }, { data: sprints, error: sprintsError }, { data: jobs, error: jobsError }] = await Promise.all([
      selectProjectSummaryTasksWithCompat(db, projectIds),
      selectProjectSummarySprintsWithCompat(db, projectIds),
      db.from("jobs").select("project_id, status").in("project_id", projectIds).in("status", ["queued", "in_progress", "blocked"]),
    ]);

    if (tasksError || sprintsError || jobsError) {
      return NextResponse.json({ error: tasksError?.message || sprintsError?.message || jobsError?.message || "Failed to resolve project progress truth" }, { status: 500 });
    }

    const projectTruthById = buildProjectTruthIndex({
      projects,
      tasks: tasks ?? [],
      sprints: sprints ?? [],
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

  const sanitizedIntake = { ...intake };
  delete sanitizedIntake.githubRepoProvisioning;
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
        provisioningState = {
          status: "failed",
          reason: provisionError instanceof Error ? provisionError.message : "GitHub repo auto-provisioning failed.",
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
      }
    }

    const dispatchResults = hasAttachments
      ? []
      : await finalizeProjectCreate(db, {
          project,
          name,
          type,
          intake: sanitizedIntake,
          links: sanitizedLinks,
          githubRepoBinding: project.github_repo_binding || githubBinding || null,
          teamId,
        });

    return NextResponse.json({
      project: { ...project, intake: project.intake || sanitizedIntake || null, links: sanitizedLinks, github_repo_binding: project.github_repo_binding || githubBinding || null },
      workload,
      dispatch: {
        attempted: dispatchResults.length,
        dispatched: dispatchResults.filter((result) => result.dispatched).length,
        blocked: dispatchResults.filter((result) => !result.dispatched && result.blocker).length,
        results: dispatchResults,
      },
    }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

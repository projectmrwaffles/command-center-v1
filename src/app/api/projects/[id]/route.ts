import { getProjectArtifactIntegrity } from "@/lib/project-artifact-requirements";
import { getTaskExecutionBlocker } from "@/lib/project-execution";
import { deriveProjectTruth, deriveSprintTruth } from "@/lib/project-truth";
import { sanitizeProjectLinks } from "@/lib/project-links";
import { createGitHubRepoBinding, getGitHubRepoProvenance, getGitHubRepoUrlFromProjectArtifacts, getGitHubRepoValidationError, getNetNewGitHubRepoGuardError, githubProvisioningAvailable, mergeProjectLinksForGitHubUpdate, syncProjectLinksWithGitHubBinding, type GitHubRepoBinding, type GitHubRepoBindingInput } from "@/lib/github-repo-binding";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { isMissingGithubRepoBindingColumnError, isMissingLinksColumnError, selectProjectWithArtifactCompat } from "@/lib/project-db-compat";
import { NextRequest, NextResponse } from "next/server";

type TeamWithId = {
  id: string;
  name: string;
};

type TeamMemberWithAgent = {
  team_id: string;
  agent_id: string | null;
  agents: {
    name: string;
    title: string | null;
    status: string;
    last_seen: string | null;
  } | null;
};

type RecentSignal = {
  id: string;
  kind: "blocked" | "approval" | "completed" | "progress" | "activity";
  title: string;
  detail: string;
  timestamp: string;
  actorName?: string | null;
};

function deriveCompatGithubBinding(project: {
  links?: { github?: string | null } | null;
  intake?: {
    projectOrigin?: "new" | "existing" | null;
    links?: { github?: string | null } | null;
    githubRepoSource?: "linked" | "provisioned" | null;
  } | null;
  github_repo_binding?: GitHubRepoBinding | null;
}) {
  if (project.github_repo_binding?.url) return project.github_repo_binding;

  const githubUrl = project.links?.github || project.intake?.links?.github;
  if (!githubUrl) return null;

  const storedCompatSource = project.intake?.githubRepoSource;
  const shouldAssumeProvisioned = storedCompatSource === "provisioned"
    || (project.intake?.projectOrigin === "new" && !project.links?.github && Boolean(project.intake?.links?.github));

  return createGitHubRepoBinding({
    url: githubUrl,
    source: shouldAssumeProvisioned ? "provisioned" : "linked",
  });
}

function formatEventType(eventType: string) {
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toTeamMembers(rows: any[]): TeamMemberWithAgent[] {
  return rows.map((row) => {
    const agentRow = Array.isArray(row.agents) ? row.agents[0] : row.agents;
    return {
      team_id: row.team_id,
      agent_id: row.agent_id ?? null,
      agents: agentRow
        ? {
            name: agentRow.name,
            title: agentRow.title ?? null,
            status: agentRow.status,
            last_seen: agentRow.last_seen ?? null,
          }
        : null,
    };
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const params = await ctx.params;
    const projectId = params.id;

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data: project, error: projectError } = await selectProjectWithArtifactCompat(
      db,
      projectId,
      "id, name, type, team_id, description, intake, intake_summary, status, progress_pct, created_at, updated_at"
    );

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const derivedGithubBinding = deriveCompatGithubBinding(project);
    const projectWithDerivedArtifacts = {
      ...project,
      github_repo_binding: derivedGithubBinding,
      links: syncProjectLinksWithGitHubBinding(project.links || project.intake?.links || null, derivedGithubBinding),
    };

    const [{ data: tasks }, { data: sprints }, { data: events }, { data: approvals }, { data: jobs }] = await Promise.all([
      db.from("sprint_items").select("*").eq("project_id", projectId).order("position", { ascending: true }),
      db.from("sprints").select("*").eq("project_id", projectId).order("phase_order", { ascending: true }).order("created_at", { ascending: true }),
      db
        .from("agent_events")
        .select("id, event_type, payload, timestamp, agents(name)")
        .eq("project_id", projectId)
        .order("timestamp", { ascending: false })
        .limit(50),
      db
        .from("approvals")
        .select("id, summary, severity, status, created_at, sprint_id, context")
        .eq("project_id", projectId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10),
      db
        .from("jobs")
        .select("id, title, status, updated_at, owner_agent_id")
        .eq("project_id", projectId)
        .in("status", ["queued", "blocked", "in_progress"])
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    const assignedAgentIds = Array.from(
      new Set((tasks || []).map((task) => task.assignee_agent_id).filter(Boolean))
    ) as string[];

    let derivedTeamIds: string[] = [];
    if (assignedAgentIds.length > 0) {
      const { data: memberships } = await db
        .from("team_members")
        .select("team_id, agent_id")
        .in("agent_id", assignedAgentIds);
      derivedTeamIds = Array.from(
        new Set((memberships || []).map((membership) => membership.team_id).filter(Boolean))
      );
    }

    const teamIds = Array.from(new Set([project.team_id, ...derivedTeamIds].filter(Boolean))) as string[];

    let teams: TeamWithId[] = [];
    if (teamIds.length > 0) {
      const { data: teamRows } = await db
        .from("teams")
        .select("id, name")
        .in("id", teamIds)
        .order("name", { ascending: true });
      teams = (teamRows || []) as TeamWithId[];
    }

    let teamMembers: TeamMemberWithAgent[] = [];
    if (teamIds.length > 0) {
      const { data: members } = await db
        .from("team_members")
        .select("team_id, agent_id, agents(name, title, status, last_seen)")
        .in("team_id", teamIds);
      teamMembers = toTeamMembers(members || []);
    }

    const teamsWithStats = teams.map((team) => {
      const members = teamMembers.filter((member) => member.team_id === team.id);
      const teamTasks =
        tasks?.filter(
          (task) => task.assignee_agent_id && members.some((member) => member.agent_id === task.assignee_agent_id)
        ) || [];
      const activeAgents = members.filter((member) => member.agents?.status === "active").length;
      const blockedTasks = teamTasks.filter((task) => task.status === "blocked").length;
      const inProgressTasks = teamTasks.filter((task) => task.status === "in_progress").length;
      const completedTasks = teamTasks.filter((task) => task.status === "done").length;

      let teamStatus = "waiting";
      if (blockedTasks > 0) teamStatus = "blocked";
      else if (inProgressTasks > 0) teamStatus = "active";
      else if (completedTasks > 0) teamStatus = "on_track";

      return {
        ...team,
        memberCount: members.length,
        activeAgents,
        taskCount: teamTasks.length,
        blockedTasks,
        inProgressTasks,
        completedTasks,
        status: teamStatus,
        members: members.map((member) => member.agents).filter(Boolean),
      };
    });

    const artifactIntegrity = getProjectArtifactIntegrity(projectWithDerivedArtifacts, tasks || []);
    const truth = deriveProjectTruth({
      tasks: tasks || [],
      sprints: sprints || [],
      jobs: jobs || [],
    });
    const overallProgress = artifactIntegrity.completionCapPct != null
      && truth.counts.delivery.done === truth.counts.delivery.total
      && truth.counts.delivery.total > 0
      ? Math.min(truth.progressPct, artifactIntegrity.completionCapPct)
      : truth.progressPct;

    const milestones = (sprints || []).map((sprint: any) => {
      const sprintTasks = (tasks || []).filter((task: any) => task.sprint_id === sprint.id);
      const sprintTruth = deriveSprintTruth({ sprint, tasks: sprintTasks });
      const pendingReview = (approvals || []).find((approval: any) => approval.sprint_id === sprint.id && approval.status === "pending");
      return {
        id: sprint.id,
        name: sprint.name,
        goal: sprint.goal,
        status: sprint.status,
        phaseKey: sprint.phase_key ?? null,
        phaseOrder: sprint.phase_order ?? null,
        autoGenerated: sprint.auto_generated ?? false,
        category: sprintTruth.category,
        approvalGateRequired: sprint.approval_gate_required ?? false,
        approvalGateStatus: sprint.approval_gate_status ?? "not_requested",
        totalTasks: sprintTruth.totalTasks,
        doneTasks: sprintTruth.doneTasks,
        queuedTasks: sprintTruth.queuedTasks,
        runningTasks: sprintTruth.runningTasks,
        blockedTasks: sprintTruth.blockedTasks,
        hiddenBootstrapTasks: sprintTruth.hiddenBootstrapTasks,
        progressPct: sprintTruth.progressPct,
        reviewRequest: pendingReview
          ? {
              id: pendingReview.id,
              status: pendingReview.status,
              summary: pendingReview.summary,
              createdAt: pendingReview.created_at,
              links: pendingReview.context?.links ?? null,
            }
          : null,
      };
    });

    const queuedExecutionReasons = (tasks || [])
      .filter((task: any) => task.status === "todo")
      .map((task: any) => {
        const blocker = getTaskExecutionBlocker({
          project: projectWithDerivedArtifacts,
          task,
          sprint: (sprints || []).find((sprint: any) => sprint.id === task.sprint_id) ?? null,
          sprints: (sprints || []) as any,
          jobs: (jobs || []) as any,
        });

        return blocker
          ? {
              taskId: task.id,
              taskTitle: task.title,
              sprintId: task.sprint_id ?? null,
              status: blocker.key,
              label: blocker.label,
              detail: blocker.detail,
            }
          : null;
      })
      .filter(Boolean)
      .slice(0, 8);

    const recentSignals: RecentSignal[] = [
      ...(approvals || []).map((approval) => ({
        id: `approval-${approval.id}`,
        kind: "approval" as const,
        title: approval.summary || "Approval requested",
        detail: approval.severity ? `${approval.severity} priority approval is waiting` : "Approval is waiting",
        timestamp: approval.created_at,
      })),
      ...(jobs || []).map((job) => ({
        id: `job-${job.id}`,
        kind: job.status === "blocked" ? ("blocked" as const) : ("progress" as const),
        title:
          job.title ||
          (job.status === "blocked"
            ? "Blocked job"
            : job.status === "queued"
              ? "Queued job"
              : "Active job"),
        detail:
          job.status === "blocked"
            ? "A job is blocked and needs attention"
            : job.status === "queued"
              ? "A dispatched job is queued for agent pickup"
              : "A job is currently running",
        timestamp: job.updated_at || new Date().toISOString(),
      })),
      ...(events || []).map((event: any) => ({
        id: `event-${event.id}`,
        kind:
          event.event_type === "task_completed"
            ? ("completed" as const)
            : event.event_type === "task_dispatched" || event.event_type.includes("status_changed")
              ? ("progress" as const)
              : event.event_type.includes("blocked")
                ? ("blocked" as const)
                : ("activity" as const),
        title: formatEventType(event.event_type),
        detail:
          event.payload?.title ||
          event.payload?.message ||
          (event.payload && Object.keys(event.payload).length > 0 ? JSON.stringify(event.payload).slice(0, 120) : "Recent project activity"),
        timestamp: event.timestamp,
        actorName: Array.isArray(event.agents) ? event.agents[0]?.name : event.agents?.name,
      })),
    ]
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
      .slice(0, 12);

    return NextResponse.json({
      project: {
        ...projectWithDerivedArtifacts,
        github_repo_provenance: getGitHubRepoProvenance({
          binding: projectWithDerivedArtifacts.github_repo_binding,
          projectOrigin: projectWithDerivedArtifacts.intake?.projectOrigin,
        }),
        progress_pct: overallProgress,
      },
      deliveryIntegrity: artifactIntegrity,
      teams: teamsWithStats,
      milestones,
      sprints: sprints || [],
      tasks: tasks || [],
      events: events || [],
      recentSignals,
      truth: {
        ...truth,
        progressPct: overallProgress,
      },
      executionVisibility: {
        queuedReasons: queuedExecutionReasons,
      },
      stats: {
        totalTasks: truth.counts.delivery.total,
        doneTasks: truth.counts.delivery.done,
        queuedTasks: truth.counts.delivery.queued,
        blockedTasks: truth.counts.delivery.blocked,
        inProgressTasks: truth.counts.delivery.running,
        bootstrapTasks: truth.counts.bootstrap.total,
        pendingApprovals: approvals?.length || 0,
      },
    });
  } catch (e: unknown) {
    console.error("[API /projects/:id] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const params = await ctx.params;
    const projectId = params.id;
    const body = await req.json();
    const { status, links, githubRepo, provisionGithubRepo, confirmLinkedRepoForNetNew } = body as {
      status?: string;
      links?: Record<string, string>;
      githubRepo?: GitHubRepoBindingInput | null;
      provisionGithubRepo?: boolean;
      confirmLinkedRepoForNetNew?: boolean;
    };

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      if (!["active", "paused", "completed", "archived"].includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      update.status = status;
    }

    const githubRepoUrl = githubRepo === null ? null : getGitHubRepoUrlFromProjectArtifacts({ githubRepo, links });
    const githubRepoError = getGitHubRepoValidationError(githubRepoUrl);
    if (githubRepoError) {
      return NextResponse.json({ error: githubRepoError }, { status: 400 });
    }

    if (provisionGithubRepo && !githubProvisioningAvailable()) {
      return NextResponse.json({ error: "GitHub repo provisioning is not available in this environment yet. Link an existing repo for now." }, { status: 501 });
    }

    if (links !== undefined || githubRepo !== undefined) {
      const db = createRouteHandlerClient();
      if (!db) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
      }

      const { data: currentProject, error: currentProjectError } = await selectProjectWithArtifactCompat(
        db,
        projectId,
        "id, intake"
      );

      if (currentProjectError || !currentProject) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      const netNewGitHubRepoGuardError = getNetNewGitHubRepoGuardError({
        projectOrigin: currentProject.intake?.projectOrigin,
        githubRepoUrl,
        confirmLinkedRepo: confirmLinkedRepoForNetNew,
      });
      if (netNewGitHubRepoGuardError) {
        return NextResponse.json({ error: netNewGitHubRepoGuardError }, { status: 400 });
      }

      const existingBinding = (currentProject.github_repo_binding || null) as GitHubRepoBinding | null;
      const sanitizedIncomingLinks = links === undefined ? undefined : sanitizeProjectLinks(links);
      const githubBinding = githubRepo === null
        ? null
        : createGitHubRepoBinding(
            {
              url: githubRepoUrl,
              source: provisionGithubRepo ? "provisioned" : githubRepo?.source || existingBinding?.source || "linked",
              ...githubRepo,
            },
            existingBinding
          ) ?? existingBinding;
      update.github_repo_binding = githubBinding;
      update.links = mergeProjectLinksForGitHubUpdate(
        currentProject.links as Record<string, string> | null | undefined,
        sanitizedIncomingLinks,
        githubBinding,
        { replaceAll: links !== undefined }
      );
    }

    if (Object.keys(update).length === 1) {
      return NextResponse.json({ error: "No valid changes provided" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    let { data, error } = await db
      .from("projects")
      .update(update)
      .eq("id", projectId)
      .select()
      .single();

    if (error && isMissingGithubRepoBindingColumnError(error) && "github_repo_binding" in update) {
      const updateWithoutBinding = { ...update };
      delete updateWithoutBinding.github_repo_binding;
      const retry = await db
        .from("projects")
        .update(updateWithoutBinding)
        .eq("id", projectId)
        .select()
        .single();
      data = retry.data ? { ...retry.data, github_repo_binding: null } : retry.data;
      error = retry.error;
    }

    if (error && isMissingLinksColumnError(error) && "links" in update) {
      const updateWithoutArtifacts = { ...update };
      delete updateWithoutArtifacts.links;
      delete updateWithoutArtifacts.github_repo_binding;
      const retry = await db
        .from("projects")
        .update(updateWithoutArtifacts)
        .eq("id", projectId)
        .select()
        .single();
      data = retry.data ? { ...retry.data, links: null, github_repo_binding: null } : retry.data;
      error = retry.error;
    }

    if (error) {
      console.error("[API /projects/:id] update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ project: data });
  } catch (e: unknown) {
    console.error("[API /projects/:id] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;

    const params = await ctx.params;
    const projectId = params.id;

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const [sprintsRes, jobsRes, approvalsRes] = await Promise.all([
      db.from("sprints").select("id").eq("project_id", projectId),
      db.from("jobs").select("id").eq("project_id", projectId),
      db.from("approvals").select("id").eq("project_id", projectId),
    ]);

    const sprintIds = sprintsRes.data?.map((s) => s.id) ?? [];
    const jobIds = jobsRes.data?.map((j) => j.id) ?? [];
    const approvalIds = approvalsRes.data?.map((a) => a.id) ?? [];

    if (approvalIds.length > 0) {
      await db.from("approvals").delete().in("id", approvalIds);
    }
    // Delete all project tasks first, including project-level tasks with null sprint_id.
    await db.from("sprint_items").delete().eq("project_id", projectId);
    if (sprintIds.length > 0) {
      await db.from("sprints").delete().in("id", sprintIds);
    }
    if (jobIds.length > 0) {
      await db.from("ai_usage").delete().in("job_id", jobIds);
      await db.from("jobs").delete().in("id", jobIds);
    }
    await db.from("ai_usage").delete().eq("project_id", projectId);
    await db.from("agent_events").delete().eq("project_id", projectId);

    const { data, error } = await db
      .from("projects")
      .delete()
      .eq("id", projectId)
      .select()
      .single();

    if (error) {
      console.error("[API /projects/:id] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ project: data });
  } catch (e: unknown) {
    console.error("[API /projects/:id] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

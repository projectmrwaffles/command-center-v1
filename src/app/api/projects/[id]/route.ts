import { getProjectArtifactIntegrity } from "@/lib/project-artifact-requirements";
import { getTaskExecutionBlocker } from "@/lib/project-execution";
import { reconcileProjectPhaseProgression } from "@/lib/project-handoff";
import { deriveProjectTruth, deriveSprintTruth } from "@/lib/project-truth";
import { sanitizeProjectLinks } from "@/lib/project-links";
import { derivePreBuildCheckpointState, syncProjectPreBuildCheckpoint } from "@/lib/pre-build-checkpoint";
import { deriveReviewArtifacts } from "@/lib/review-requests";
import { filterLegacyAttachmentShellState } from "@/lib/project-attachment-finalize";
import { deriveMilestoneEvidenceRequirements, resolveMilestoneCheckpointType } from "@/lib/milestone-review";
import { createGitHubRepoBinding, getGitHubRepoProvenance, getGitHubRepoUrlFromProjectArtifacts, getGitHubRepoValidationError, getNetNewGitHubRepoGuardError, githubProvisioningAvailable, mergeProjectLinksForGitHubUpdate, syncProjectLinksWithGitHubBinding, type GitHubRepoBinding, type GitHubRepoBindingInput } from "@/lib/github-repo-binding";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { isMissingGithubRepoBindingColumnError, isMissingLinksColumnError, selectProjectWithArtifactCompat } from "@/lib/project-db-compat";
import { NextRequest, NextResponse } from "next/server";

const PROJECT_DOCS_BUCKET = "project_docs";
const STORAGE_LIST_PAGE_SIZE = 100;

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

async function listStoragePathsRecursively(db: NonNullable<ReturnType<typeof createRouteHandlerClient>>, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await db.storage.from(PROJECT_DOCS_BUCKET).list(prefix, {
      limit: STORAGE_LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      if (error.statusCode === "404") return paths;
      throw new Error(error.message || `Failed to list storage objects for ${prefix}`);
    }

    const entries = data ?? [];
    for (const entry of entries) {
      const childPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const isFolder = !entry.id && !entry.metadata;
      if (isFolder) {
        paths.push(...await listStoragePathsRecursively(db, childPath));
      } else {
        paths.push(childPath);
      }
    }

    if (entries.length < STORAGE_LIST_PAGE_SIZE) break;
    offset += entries.length;
  }

  return paths;
}

async function removeStoragePaths(db: NonNullable<ReturnType<typeof createRouteHandlerClient>>, paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  if (uniquePaths.length === 0) return;

  for (let index = 0; index < uniquePaths.length; index += 100) {
    const batch = uniquePaths.slice(index, index + 100);
    const { error } = await db.storage.from(PROJECT_DOCS_BUCKET).remove(batch);
    if (error && error.statusCode !== "404") {
      throw new Error(error.message || "Failed to remove project storage objects");
    }
  }
}

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

    const effectiveProject: any = {
      ...projectWithDerivedArtifacts,
      intake: projectWithDerivedArtifacts.intake || null,
      links: projectWithDerivedArtifacts.links || null,
      github_repo_binding: projectWithDerivedArtifacts.github_repo_binding || null,
    };

    await syncProjectPreBuildCheckpoint(db as any, {
      projectId,
      project: {
        ...effectiveProject,
        intake: effectiveProject.intake || null,
        links: effectiveProject.links || null,
        github_repo_binding: effectiveProject.github_repo_binding || null,
      },
    });

    const includeActivity = req.nextUrl.searchParams.get("include") === "activity";
    const [{ data: tasks }, { data: sprints }, eventsResult, { data: approvals }, { data: jobs }, { data: agents }, { data: completionEvents }] = await Promise.all([
      db.from("sprint_items").select("*").eq("project_id", projectId).order("position", { ascending: true }),
      db.from("sprints").select("*").eq("project_id", projectId).order("phase_order", { ascending: true }).order("created_at", { ascending: true }),
      includeActivity
        ? db
            .from("agent_events")
            .select("id, event_type, payload, timestamp, agents(name)")
            .eq("project_id", projectId)
            .order("timestamp", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as any[] }),
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
      db
        .from("agents")
        .select("id, status, current_job_id")
        .not("name", "like", "_archived_%"),
      db
        .from("agent_events")
        .select("event_type, payload")
        .eq("project_id", projectId)
        .eq("event_type", "task_completed")
        .order("timestamp", { ascending: false })
        .limit(100),
    ]);
    const events = eventsResult?.data || [];
    const visibleProjectState = filterLegacyAttachmentShellState({
      sprints: sprints || [],
      tasks: tasks || [],
    });
    const visibleSprints = visibleProjectState.sprints;
    const visibleTasks = visibleProjectState.tasks;

    const completionEventsByTaskId = new Map(
      (completionEvents || [])
        .map((event: any) => [typeof event.payload?.task_id === "string" ? event.payload.task_id : null, event] as const)
        .filter((entry): entry is [string, any] => Boolean(entry[0]))
    );

    const assignedAgentIds = Array.from(
      new Set((visibleTasks || []).map((task) => task.assignee_agent_id).filter(Boolean))
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
        visibleTasks?.filter(
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

    const sprintIds = (sprints || []).map((s: any) => s.id).filter(Boolean);
    const submissionRows = sprintIds.length > 0
      ? ((await db.from("milestone_submissions").select("*").in("sprint_id", sprintIds).order("revision_number", { ascending: false })).data || [])
      : [];
    const submissionIds = submissionRows.map((row: any) => row.id).filter(Boolean);
    const proofBundleRows = submissionIds.length > 0
      ? ((await db.from("proof_bundles").select("*").in("submission_id", submissionIds)).data || [])
      : [];
    const proofBundleIds = proofBundleRows.map((row: any) => row.id).filter(Boolean);
    const proofItemRows = proofBundleIds.length > 0
      ? ((await db.from("proof_items").select("*").in("proof_bundle_id", proofBundleIds)).data || [])
      : [];
    const feedbackRows = submissionIds.length > 0
      ? ((await db.from("submission_feedback_items").select("*").in("submission_id", submissionIds)).data || [])
      : [];

    const artifactIntegrity = getProjectArtifactIntegrity(effectiveProject, visibleTasks || []);
    const preBuildCheckpoint = derivePreBuildCheckpointState(effectiveProject);
    const truth = deriveProjectTruth({
      project: effectiveProject,
      tasks: visibleTasks || [],
      sprints: visibleSprints || [],
      jobs: jobs || [],
      agents: agents || [],
    });
    const overallProgress = artifactIntegrity.completionCapPct != null
      && truth.counts.delivery.done === truth.counts.delivery.total
      && truth.counts.delivery.total > 0
      ? Math.min(truth.progressPct, artifactIntegrity.completionCapPct)
      : truth.progressPct;

    const milestones = (visibleSprints || []).map((sprint: any) => {
      const sprintTasks = (visibleTasks || []).filter((task: any) => task.sprint_id === sprint.id);
      const sprintTruth = deriveSprintTruth({ sprint, tasks: sprintTasks });
      const pendingReview = (approvals || []).find((approval: any) => approval.sprint_id === sprint.id && approval.status === "pending");
      const sprintSubmissions = submissionRows.filter((submission: any) => submission.sprint_id === sprint.id);
      const latestSubmission = sprintSubmissions[0] || null;
      const latestBundle = latestSubmission ? proofBundleRows.find((bundle: any) => bundle.submission_id === latestSubmission.id) || null : null;
      const latestProofItems = latestBundle ? proofItemRows.filter((item: any) => item.proof_bundle_id === latestBundle.id) : [];
      const latestFeedbackItems = latestSubmission ? feedbackRows.filter((item: any) => item.submission_id === latestSubmission.id) : [];
      const reviewTasks = sprintTasks.filter((task: any) => task.review_required);
      const derivedArtifacts = deriveReviewArtifacts({
        reviewTasks,
        completionEvents: reviewTasks
          .map((task: any) => completionEventsByTaskId.get(task.id))
          .filter(Boolean),
      });
      const sprintTaskTypes = sprintTasks.map((task: any) => task.task_type);
      const resolvedCheckpointType = resolveMilestoneCheckpointType({
        checkpointType: sprint.checkpoint_type,
        sprintName: sprint.name,
        phaseKey: sprint.phase_key,
        taskTypes: sprintTaskTypes,
      }) || sprint.checkpoint_type || "delivery_review";
      const resolvedCheckpointEvidenceRequirements = deriveMilestoneEvidenceRequirements({
        checkpointType: resolvedCheckpointType,
        explicitRequirements: sprint.checkpoint_evidence_requirements,
        sprintName: sprint.name,
        phaseKey: sprint.phase_key,
        taskTypes: sprintTaskTypes,
      });
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
        checkpointType: resolvedCheckpointType,
        checkpointEvidenceRequirements: resolvedCheckpointEvidenceRequirements,
        totalTasks: sprintTruth.totalTasks,
        doneTasks: sprintTruth.doneTasks,
        queuedTasks: sprintTruth.queuedTasks,
        runningTasks: sprintTruth.runningTasks,
        blockedTasks: sprintTruth.blockedTasks,
        hiddenBootstrapTasks: sprintTruth.hiddenBootstrapTasks,
        progressPct: sprintTruth.progressPct,
        reviewArtifacts: pendingReview?.context?.artifacts ?? derivedArtifacts,
        reviewRequest: pendingReview
          ? {
              id: pendingReview.id,
              status: pendingReview.status,
              summary: pendingReview.summary,
              createdAt: pendingReview.created_at,
              links: pendingReview.context?.links ?? null,
            }
          : null,
        reviewSummary: latestSubmission
          ? {
              latestSubmissionId: latestSubmission.id,
              latestSubmissionStatus: latestSubmission.status ?? null,
              latestRevisionNumber: latestSubmission.revision_number ?? null,
              checkpointType: latestSubmission.checkpoint_type ?? resolvedCheckpointType,
              evidenceRequirements: latestSubmission.evidence_requirements ?? resolvedCheckpointEvidenceRequirements,
              latestSubmissionSummary: latestSubmission.summary ?? null,
              latestDecision: latestSubmission.decision ?? null,
              latestDecisionNotes: latestSubmission.decision_notes ?? null,
              latestRejectionComment: latestSubmission.rejection_comment ?? latestSubmission.decision_notes ?? null,
              latestSubmittedAt: latestSubmission.submitted_at ?? null,
              proofBundleId: latestBundle?.id ?? null,
              proofBundleTitle: latestBundle?.title ?? null,
              proofCompletenessStatus: latestBundle?.completeness_status ?? null,
              proofItemCount: latestProofItems.length,
              screenshotItemCount: latestProofItems.filter((item: any) => item.kind === "screenshot").length,
              feedbackItemCount: latestFeedbackItems.length,
            }
          : null,
        preBuildCheckpoint: sprint.phase_key === "build" || /\bbuild\b/i.test(sprint.name || "") ? preBuildCheckpoint : null,
      };
    });

    const queuedExecutionReasons = (visibleTasks || [])
      .filter((task: any) => task.status === "todo")
      .map((task: any) => {
        const blocker = getTaskExecutionBlocker({
          project: effectiveProject,
          task,
          sprint: (visibleSprints || []).find((sprint: any) => sprint.id === task.sprint_id) ?? null,
          sprints: (visibleSprints || []) as any,
          jobs: (jobs || []) as any,
          agents: (agents || []) as any,
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
        ...effectiveProject,
        github_repo_provenance: getGitHubRepoProvenance({
          binding: effectiveProject.github_repo_binding,
          projectOrigin: effectiveProject.intake?.projectOrigin,
          provisioningState: effectiveProject.intake?.githubRepoProvisioning,
        }),
        progress_pct: overallProgress,
        preBuildCheckpoint,
      },
      deliveryIntegrity: artifactIntegrity,
      teams: teamsWithStats,
      milestones,
      sprints: visibleSprints || [],
      tasks: visibleTasks || [],
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

    if (links !== undefined || githubRepo !== undefined || provisionGithubRepo) {
      await syncProjectPreBuildCheckpoint(db as any, {
        projectId,
        project: {
          ...data,
          intake: data?.intake || null,
          links: data?.links || null,
          github_repo_binding: data?.github_repo_binding || null,
        },
      });
      await reconcileProjectPhaseProgression(db as any, {
        projectId,
        projectName: data?.name || null,
      });
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

    const [sprintsRes, jobsRes, projectDocumentsRes, prdsResRaw] = await Promise.all([
      db.from("sprints").select("id").eq("project_id", projectId),
      db.from("jobs").select("id").eq("project_id", projectId),
      db.from("project_documents").select("storage_path").eq("project_id", projectId),
      db.from("prds").select("storage_path").eq("project_id", projectId),
    ]);

    const prdsRes = prdsResRaw.error && (prdsResRaw.error.code === "42703" || prdsResRaw.error.code === "PGRST204" || prdsResRaw.error.code === "42P01" || prdsResRaw.error.code === "PGRST205" || prdsResRaw.error.message?.includes("column prds.storage_path does not exist") || prdsResRaw.error.message?.includes('relation "public.prds" does not exist') || prdsResRaw.error.message?.includes("Could not find the table 'public.prds'"))
      ? { ...prdsResRaw, data: [], error: null }
      : prdsResRaw;

    if (sprintsRes.error) {
      console.error("[API /projects/:id] failed to load sprints for delete:", sprintsRes.error);
      return NextResponse.json({ error: sprintsRes.error.message }, { status: 500 });
    }

    if (jobsRes.error) {
      console.error("[API /projects/:id] failed to load jobs for delete:", jobsRes.error);
      return NextResponse.json({ error: jobsRes.error.message }, { status: 500 });
    }

    if (projectDocumentsRes.error) {
      console.error("[API /projects/:id] failed to load project documents for delete:", projectDocumentsRes.error);
      return NextResponse.json({ error: projectDocumentsRes.error.message }, { status: 500 });
    }

    if (prdsRes.error) {
      console.error("[API /projects/:id] failed to load prds for delete:", prdsRes.error);
      return NextResponse.json({ error: prdsRes.error.message }, { status: 500 });
    }

    const sprintIds = sprintsRes.data?.map((s) => s.id) ?? [];
    const jobIds = jobsRes.data?.map((j) => j.id) ?? [];
    const explicitStoragePaths = [
      ...(projectDocumentsRes.data ?? []).map((row) => row.storage_path).filter((value): value is string => Boolean(value)),
      ...(prdsRes.data ?? []).map((row) => row.storage_path).filter((value): value is string => Boolean(value)),
    ];
    const prefixedStoragePaths = await listStoragePathsRecursively(db, projectId);

    const deleteStep = async (label: string, operation: any) => {
      const { error } = await Promise.resolve(operation);
      if (error) {
        console.error(`[API /projects/:id] ${label} delete error:`, error);
        throw new Error(error.message);
      }
    };

    await deleteStep("approvals(project)", Promise.resolve(db.from("approvals").delete().eq("project_id", projectId)));
    await deleteStep("project_documents", Promise.resolve(db.from("project_documents").delete().eq("project_id", projectId)));

    if (sprintIds.length > 0) {
      await deleteStep("approvals(sprint)", Promise.resolve(db.from("approvals").delete().in("sprint_id", sprintIds)));
    }

    await deleteStep("sprint_items", Promise.resolve(db.from("sprint_items").delete().eq("project_id", projectId)));

    if (sprintIds.length > 0) {
      await deleteStep("sprints", Promise.resolve(db.from("sprints").delete().in("id", sprintIds)));
    }

    if (jobIds.length > 0) {
      await deleteStep("approvals(job)", Promise.resolve(db.from("approvals").delete().in("job_id", jobIds)));
      await deleteStep("ai_usage(job)", Promise.resolve(db.from("ai_usage").delete().in("job_id", jobIds)));
      await deleteStep("ai_usage_events(job)", Promise.resolve(db.from("ai_usage_events").delete().in("job_id", jobIds)));
      await deleteStep("agent_events(job)", Promise.resolve(db.from("agent_events").delete().in("job_id", jobIds)));
      await deleteStep("artifacts(job)", Promise.resolve(db.from("artifacts").delete().in("job_id", jobIds)));
      await deleteStep("jobs", Promise.resolve(db.from("jobs").delete().in("id", jobIds)));
    }

    await deleteStep("ai_usage(project)", Promise.resolve(db.from("ai_usage").delete().eq("project_id", projectId)));
    await deleteStep("ai_usage_events(project)", Promise.resolve(db.from("ai_usage_events").delete().eq("project_id", projectId)));
    await deleteStep("usage_rollup_minute(project)", Promise.resolve(db.from("usage_rollup_minute").delete().eq("project_id", projectId)));
    await deleteStep("agent_events(project)", Promise.resolve(db.from("agent_events").delete().eq("project_id", projectId)));
    await deleteStep("artifacts(project)", Promise.resolve(db.from("artifacts").delete().eq("project_id", projectId)));
    await removeStoragePaths(db, [...explicitStoragePaths, ...prefixedStoragePaths]);

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

import { getProjectTaskPosition, syncProjectState } from "@/lib/project-state";
import { dispatchEligibleProjectTasks } from "@/lib/project-execution";
import { getAutoRouteTeamIdsFromIntake, type ProjectIntake } from "@/lib/project-intake";
import { seedProjectKickoffPlan } from "@/lib/project-kickoff";

type ProjectDb = any;

export const PROJECT_CREATE_TEAMS = {
  ENGINEERING: "11111111-1111-1111-1111-000000000001",
  DESIGN: "11111111-1111-1111-1111-000000000002",
  PRODUCT: "11111111-1111-1111-1111-000000000003",
  MARKETING: "11111111-1111-1111-1111-000000000004",
  QA: "11111111-1111-1111-1111-000000000005",
} as const;

export function getDefaultAutoRouteTeamIds(type: string): string[] {
  const teamMap: Record<string, string[]> = {
    saas: [PROJECT_CREATE_TEAMS.ENGINEERING, PROJECT_CREATE_TEAMS.DESIGN, PROJECT_CREATE_TEAMS.PRODUCT, PROJECT_CREATE_TEAMS.QA],
    web_app: [PROJECT_CREATE_TEAMS.ENGINEERING, PROJECT_CREATE_TEAMS.DESIGN, PROJECT_CREATE_TEAMS.PRODUCT, PROJECT_CREATE_TEAMS.QA],
    native_app: [PROJECT_CREATE_TEAMS.ENGINEERING, PROJECT_CREATE_TEAMS.DESIGN, PROJECT_CREATE_TEAMS.PRODUCT, PROJECT_CREATE_TEAMS.QA],
    marketing: [PROJECT_CREATE_TEAMS.MARKETING, PROJECT_CREATE_TEAMS.DESIGN, PROJECT_CREATE_TEAMS.PRODUCT],
    product_build: [PROJECT_CREATE_TEAMS.ENGINEERING, PROJECT_CREATE_TEAMS.DESIGN, PROJECT_CREATE_TEAMS.PRODUCT, PROJECT_CREATE_TEAMS.QA],
    marketing_growth: [PROJECT_CREATE_TEAMS.MARKETING, PROJECT_CREATE_TEAMS.DESIGN, PROJECT_CREATE_TEAMS.PRODUCT],
    ops_enablement: [PROJECT_CREATE_TEAMS.PRODUCT, PROJECT_CREATE_TEAMS.ENGINEERING, PROJECT_CREATE_TEAMS.DESIGN, PROJECT_CREATE_TEAMS.QA],
    strategy_research: [PROJECT_CREATE_TEAMS.PRODUCT, PROJECT_CREATE_TEAMS.DESIGN],
    hybrid: [PROJECT_CREATE_TEAMS.PRODUCT, PROJECT_CREATE_TEAMS.DESIGN, PROJECT_CREATE_TEAMS.ENGINEERING, PROJECT_CREATE_TEAMS.QA],
    other: [PROJECT_CREATE_TEAMS.PRODUCT, PROJECT_CREATE_TEAMS.ENGINEERING, PROJECT_CREATE_TEAMS.QA],
  };
  return teamMap[type] || [PROJECT_CREATE_TEAMS.PRODUCT, PROJECT_CREATE_TEAMS.QA];
}

export function resolveAutoRouteTeamIds(type: string, intake?: ProjectIntake | null, explicitTeamId?: string | null) {
  if (explicitTeamId) return [explicitTeamId];
  if (intake) return getAutoRouteTeamIdsFromIntake(intake, PROJECT_CREATE_TEAMS);
  return getDefaultAutoRouteTeamIds(type);
}

export async function finalizeProjectCreate(db: ProjectDb, input: {
  project: any;
  name: string;
  type: string;
  intake?: ProjectIntake | null;
  links?: Record<string, string> | null;
  githubRepoBinding?: any;
  teamId?: string | null;
}) {
  const autoTeamIds = resolveAutoRouteTeamIds(input.type, input.intake, input.teamId || input.project?.team_id || null);
  let kickoffSeeded = false;
  const nextTaskPosition = await getProjectTaskPosition(db, input.project.id);

  try {
    const kickoff = await seedProjectKickoffPlan(db, {
      projectId: input.project.id,
      projectName: input.name,
      type: input.type,
      intake: input.intake || undefined,
      startPosition: nextTaskPosition,
    });

    kickoffSeeded = kickoff.tasks.length > 0;
  } catch (kickoffError) {
    console.error("[project-create-finalize] kickoff seeding failed, falling back to legacy team tasks:", kickoffError);
  }

  if (!kickoffSeeded) {
    const { data: kickoffSprint, error: sprintError } = await db
      .from("sprints")
      .insert({
        project_id: input.project.id,
        name: "Kickoff",
        goal: "Initial delivery setup and routing",
        status: "active",
      })
      .select("id")
      .single();

    if (sprintError || !kickoffSprint?.id) {
      console.error("[project-create-finalize] legacy kickoff sprint insert error:", sprintError);
    } else {
      const teamTaskTemplates: Record<string, string> = {
        [PROJECT_CREATE_TEAMS.ENGINEERING]: "Set up development environment and architecture",
        [PROJECT_CREATE_TEAMS.DESIGN]: "Create initial wireframes and design system",
        [PROJECT_CREATE_TEAMS.PRODUCT]: "Define product requirements and user stories",
        [PROJECT_CREATE_TEAMS.MARKETING]: "Plan marketing strategy and messaging",
        [PROJECT_CREATE_TEAMS.QA]: "Create test plan and quality criteria",
      };

      let fallbackTaskPosition = nextTaskPosition;

      for (const teamId of autoTeamIds) {
        const { data: teamMembers } = await db
          .from("team_members")
          .select("agent_id, role")
          .eq("team_id", teamId)
          .order("role", { ascending: true });

        if (!teamMembers?.length) continue;

        const teamTask = teamTaskTemplates[teamId] || `Work on ${input.name}`;
        const leadMember = teamMembers.find((member: { role?: string }) => member.role === "lead") || teamMembers[0];

        const { error: taskError } = await db
          .from("sprint_items")
          .insert({
            sprint_id: kickoffSprint.id,
            project_id: input.project.id,
            title: teamTask,
            status: "todo",
            assignee_agent_id: leadMember.agent_id,
            position: fallbackTaskPosition,
          });

        if (taskError) {
          console.error("[project-create-finalize] legacy task insert error:", taskError);
        } else {
          fallbackTaskPosition += 1;
        }
      }
    }
  }

  await syncProjectState(db, input.project.id);

  const [{ data: tasks }, { data: sprints }, { data: jobs }, { data: agents }] = await Promise.all([
    db.from("sprint_items").select("*").eq("project_id", input.project.id),
    db.from("sprints").select("id, name, status, phase_order, created_at, approval_gate_required, approval_gate_status").eq("project_id", input.project.id),
    db.from("jobs").select("id, owner_agent_id, project_id, status, summary, updated_at").eq("project_id", input.project.id).in("status", ["queued", "in_progress", "blocked"]),
    db.from("agents").select("id, status, current_job_id").not("name", "like", "_archived_%"),
  ]);

  return dispatchEligibleProjectTasks(db as any, {
    project: {
      ...input.project,
      intake: input.intake || input.project?.intake || null,
      links: input.links || input.project?.links || null,
      github_repo_binding: input.githubRepoBinding || input.project?.github_repo_binding || null,
    },
    tasks: (tasks ?? []) as any,
    sprints: (sprints ?? []) as any,
    jobs: (jobs ?? []) as any,
    agents: (agents ?? []) as any,
  });
}

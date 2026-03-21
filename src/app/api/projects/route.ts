import { triggerAgentWork } from "@/lib/agent-dispatch";
import { getProjectTaskPosition, syncProjectState } from "@/lib/project-state";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { getAutoRouteTeamIdsFromIntake, type ProjectIntake } from "@/lib/project-intake";
import { seedProjectKickoffPlan } from "@/lib/project-kickoff";
import { sanitizeProjectLinks } from "@/lib/project-links";
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

const TEAMS = {
  ENGINEERING: "11111111-1111-1111-1111-000000000001",
  DESIGN: "11111111-1111-1111-1111-000000000002",
  PRODUCT: "11111111-1111-1111-1111-000000000003",
  MARKETING: "11111111-1111-1111-1111-000000000004",
  QA: "11111111-1111-1111-1111-000000000005",
};

const TEAM_BASE_MINUTES: Record<string, number> = {
  [TEAMS.ENGINEERING]: 30,
  [TEAMS.DESIGN]: 20,
  [TEAMS.PRODUCT]: 15,
  [TEAMS.MARKETING]: 15,
  [TEAMS.QA]: 20,
};

function getAutoRouteTeamIds(type: string): string[] {
  const teamMap: Record<string, string[]> = {
    saas: [TEAMS.ENGINEERING, TEAMS.DESIGN, TEAMS.PRODUCT, TEAMS.QA],
    web_app: [TEAMS.ENGINEERING, TEAMS.DESIGN, TEAMS.PRODUCT, TEAMS.QA],
    native_app: [TEAMS.ENGINEERING, TEAMS.DESIGN, TEAMS.PRODUCT, TEAMS.QA],
    marketing: [TEAMS.MARKETING, TEAMS.DESIGN, TEAMS.PRODUCT],
    product_build: [TEAMS.ENGINEERING, TEAMS.DESIGN, TEAMS.PRODUCT, TEAMS.QA],
    marketing_growth: [TEAMS.MARKETING, TEAMS.DESIGN, TEAMS.PRODUCT],
    ops_enablement: [TEAMS.PRODUCT, TEAMS.ENGINEERING, TEAMS.DESIGN, TEAMS.QA],
    strategy_research: [TEAMS.PRODUCT, TEAMS.DESIGN],
    hybrid: [TEAMS.PRODUCT, TEAMS.DESIGN, TEAMS.ENGINEERING, TEAMS.QA],
    other: [TEAMS.PRODUCT, TEAMS.ENGINEERING, TEAMS.QA],
  };
  return teamMap[type] || [TEAMS.PRODUCT, TEAMS.QA];
}

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

    if (error?.code === "PGRST204" && error.message.includes("'links' column")) {
      const fallback = await runQuery(selectWithoutLinks);
      projects = (fallback.data ?? []).map((project) => ({ ...(project as any), links: null }));
      error = fallback.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ projects });
  } catch (e: unknown) {
    console.error("[API /projects GET] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
    if (!auth.ok) return auth.response;
    const body = await req.json();
    const { name, type, teamId, description, intake, links } = body as {
      name?: string;
      type?: string;
      teamId?: string;
      description?: string;
      intake?: ProjectIntake;
      links?: Record<string, string>;
    };

    if (!name || !type) {
      return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const sanitizedLinks = sanitizeProjectLinks(links || intake?.links);
    const autoTeamIds = teamId
      ? [teamId]
      : intake
        ? getAutoRouteTeamIdsFromIntake(intake, TEAMS)
        : getAutoRouteTeamIds(type);
    const primaryTeamId = autoTeamIds[0];

    const workload = estimateWorkloadFromTeams(autoTeamIds);
    console.log(`[Workload Analysis] ${name}: ${workload.hours}h (${workload.complexity}) - ${workload.reasoning}`);

    const projectInsertBase = {
      name,
      type,
      team_id: primaryTeamId,
      description: description || null,
      intake: intake || null,
      intake_summary: intake?.summary || null,
      status: "active",
      progress_pct: 0,
    };

    let project: any = null;
    let error: { message: string; code?: string } | null = null;

    const firstInsert = await db.from("projects").insert({ ...projectInsertBase, links: sanitizedLinks }).select().single();
    project = firstInsert.data;
    error = firstInsert.error;

    if (error?.code === "PGRST204" && error.message.includes("'links' column")) {
      const fallbackInsert = await db.from("projects").insert(projectInsertBase).select().single();
      project = fallbackInsert.data;
      error = fallbackInsert.error;
    }

    if (error || !project) {
      console.error("[API /projects] insert error:", error);
      return NextResponse.json({ error: error?.message || "Failed to create project", code: error?.code }, { status: 500 });
    }

    let kickoffSeeded = false;
    const nextTaskPosition = await getProjectTaskPosition(db, project.id);

    try {
      const kickoff = await seedProjectKickoffPlan(db, {
        projectId: project.id,
        projectName: name,
        type,
        intake,
        startPosition: nextTaskPosition,
      });

      kickoff.tasks
        .filter((task) => task.phaseStatus === "active" && task.assigneeAgentId)
        .forEach((task) => {
          triggerAgentWork(db, task.assigneeAgentId as string, name, task.title, task.id);
        });

      kickoffSeeded = kickoff.tasks.length > 0;
    } catch (kickoffError) {
      console.error("[API /projects] kickoff seeding failed, falling back to legacy team tasks:", kickoffError);
    }

    if (!kickoffSeeded) {
      const { data: kickoffSprint, error: sprintError } = await db
        .from("sprints")
        .insert({
          project_id: project.id,
          name: "Kickoff",
          goal: "Initial delivery setup and routing",
          status: "active",
        })
        .select("id")
        .single();

      if (sprintError || !kickoffSprint?.id) {
        console.error("[API /projects] legacy kickoff sprint insert error:", sprintError);
      } else {
        const teamTaskTemplates: Record<string, string> = {
          [TEAMS.ENGINEERING]: "Set up development environment and architecture",
          [TEAMS.DESIGN]: "Create initial wireframes and design system",
          [TEAMS.PRODUCT]: "Define product requirements and user stories",
          [TEAMS.MARKETING]: "Plan marketing strategy and messaging",
          [TEAMS.QA]: "Create test plan and quality criteria",
        };

        let fallbackTaskPosition = nextTaskPosition;

        for (const teamId of autoTeamIds) {
          const { data: teamMembers } = await db
            .from("team_members")
            .select("agent_id, role")
            .eq("team_id", teamId)
            .order("role", { ascending: true });

          if (!teamMembers?.length) continue;

          const teamTask = teamTaskTemplates[teamId] || `Work on ${name}`;
          const leadMember = teamMembers.find((member: { role?: string }) => member.role === "lead") || teamMembers[0];

          const { data: createdTask, error: taskError } = await db
            .from("sprint_items")
            .insert({
              sprint_id: kickoffSprint.id,
              project_id: project.id,
              title: teamTask,
              status: "todo",
              assignee_agent_id: leadMember.agent_id,
              position: fallbackTaskPosition,
            })
            .select("id")
            .single();

          if (taskError) {
            console.error("[API /projects] legacy task insert error:", taskError);
          } else {
            fallbackTaskPosition += 1;
          }

          if (createdTask?.id) {
            triggerAgentWork(db, leadMember.agent_id, name, teamTask, createdTask.id);
          }
        }
      }
    }

    await syncProjectState(db, project.id);
    return NextResponse.json({ project: { ...project, links: sanitizedLinks }, workload }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

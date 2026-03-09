import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * Heuristic fallback when AI agent is unavailable
 */
/**
 * Estimate workload based on teams working in parallel
 * Returns the quickest time with quality output
 */
function estimateWorkloadFromTeams(teamIds: string[]): { 
  complexity: string; 
  hours: number; 
  reasoning: string;
} {
  if (teamIds.length === 0) {
    return { complexity: "low", hours: 2, reasoning: "No teams assigned" };
  }
  
  // Each team has base hours for their work
  const teamHours = teamIds.map(id => TEAM_BASE_HOURS[id] || 3);
  const maxTeamHours = Math.max(...teamHours);
  
  // Teams work in parallel, so time is based on longest team work
  // Add 20% buffer for quality assurance
  const hoursWithBuffer = Math.ceil(maxTeamHours * 1.2);
  
  const complexity = teamIds.length > 3 ? "high" : teamIds.length > 1 ? "medium" : "low";
  
  return { 
    complexity,
    hours: hoursWithBuffer,
    reasoning: `${teamIds.length} teams parallel, max ${maxTeamHours}h + 20% buffer`
  };
}

/**
 * Invoke the product-lead agent to analyze project workload
 * Returns: { complexity, hours, reasoning }
 */
// Teams IDs
const TEAMS = {
  ENGINEERING: "11111111-1111-1111-1111-000000000001",
  DESIGN: "11111111-1111-1111-1111-000000000002",
  PRODUCT: "11111111-1111-1111-1111-000000000003",
  MARKETING: "11111111-1111-1111-1111-000000000004",
  QA: "11111111-1111-1111-1111-000000000005",
};

// Base hours per team type for quality work
const TEAM_BASE_HOURS: Record<string, number> = {
  [TEAMS.ENGINEERING]: 4,
  [TEAMS.DESIGN]: 3,
  [TEAMS.PRODUCT]: 2,
  [TEAMS.MARKETING]: 2,
  [TEAMS.QA]: 2,
};

// Auto-route projects to ALL relevant teams based on type
function getAutoRouteTeamIds(type: string): string[] {
  const teamMap: Record<string, string[]> = {
    saas: [TEAMS.ENGINEERING, TEAMS.DESIGN, TEAMS.PRODUCT, TEAMS.QA],
    web_app: [TEAMS.ENGINEERING, TEAMS.DESIGN, TEAMS.PRODUCT, TEAMS.QA],
    native_app: [TEAMS.ENGINEERING, TEAMS.DESIGN, TEAMS.PRODUCT, TEAMS.QA],
    marketing: [TEAMS.MARKETING, TEAMS.DESIGN, TEAMS.PRODUCT], // No QA for marketing
    other: [TEAMS.PRODUCT, TEAMS.ENGINEERING, TEAMS.QA],
  };
  return teamMap[type] || [TEAMS.PRODUCT, TEAMS.QA];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, teamId, description } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Auto-route to team based on type (if no team specified)
    const autoTeamIds = teamId ? [teamId] : getAutoRouteTeamIds(type);
    const primaryTeamId = autoTeamIds[0]; // For backward compatibility

    // Calculate workload based on assigned teams (parallel work)
    const workload = estimateWorkloadFromTeams(autoTeamIds);
    console.log(`[Workload Analysis] ${name}: ${workload.hours}h (${workload.complexity}) - ${workload.reasoning}`);

    // Create project
    const { data: project, error } = await db
      .from("projects")
      .insert({
        name,
        type,
        team_id: primaryTeamId,
        description: description || null,
        status: "active",
        progress_pct: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("[API /projects] insert error:", error);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }

    // Auto-create sprint based on AI-analyzed workload
    const sprintName = "Sprint 1";
    const startDate = new Date().toISOString().split("T")[0];
    const endDate = new Date(Date.now() + workload.hours * 60 * 60 * 1000).toISOString();

    const { data: sprint, error: sprintError } = await db
      .from("sprints")
      .insert({
        project_id: project.id,
        name: sprintName,
        goal: `AI-analyzed workload: ${workload.complexity} complexity (${workload.hours}h estimated) - ${workload.reasoning}`,
        start_date: startDate,
        end_date: endDate,
        status: "active",
      })
      .select()
      .single();

    if (sprintError) {
      console.error("[API /projects] sprint insert error:", sprintError);
    }

    // Log project_created event with AI analysis
    const { error: eventError } = await db.from("agent_events").insert({
      agent_id: null,
      project_id: project.id,
      event_type: "project_created",
      payload: {
        name,
        type,
        team_ids: autoTeamIds,
        description: description || null,
        sprint_id: sprint?.id || null,
        workload_analysis: workload,
      },
    });

    if (eventError) {
      console.error("[API /projects] event log error:", eventError);
    }

    // Add team-specific tasks for each team
    const teamTaskTemplates: Record<string, string> = {
      [TEAMS.ENGINEERING]: "Set up development environment and architecture",
      [TEAMS.DESIGN]: "Create initial wireframes and design system",
      [TEAMS.PRODUCT]: "Define product requirements and user stories",
      [TEAMS.MARKETING]: "Plan marketing strategy and messaging",
      [TEAMS.QA]: "Create test plan and quality criteria",
    };

    for (const teamId of autoTeamIds) {
      const { data: teamMembers } = await db
        .from("team_members")
        .select("agent_id")
        .eq("team_id", teamId);

      if (teamMembers?.length) {
        const teamTask = teamTaskTemplates[teamId] || `Work on ${name}`;
        
        // Create task for the team lead/primary member
        const leadMember = teamMembers[0];
        await db.from("sprint_items").insert({
          sprint_id: sprint?.id,
          project_id: project.id,
          title: teamTask,
          status: "todo",
          assignee_agent_id: leadMember.agent_id,
          position: 1,
        });

        // Log team_assigned event
        await db.from("agent_events").insert({
          agent_id: null,
          project_id: project.id,
          event_type: "team_assigned",
          payload: {
            team_id: teamId,
            member_count: teamMembers.length,
            task: teamTask,
          },
        });
      }
    } // End for loop

    // Log planning_started event
    await db.from("agent_events").insert({
      agent_id: null,
      project_id: project.id,
      event_type: "planning_started",
      payload: {
        teams_assigned: autoTeamIds.length,
        team_ids: autoTeamIds,
      },
    });

    return NextResponse.json({ project, sprint, workload }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
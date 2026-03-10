import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * Get agent name from ID
 */
function getAgentNameFromId(agentId: string): string {
  const agentMap: Record<string, string> = {
    "11111111-1111-1111-1111-000000000001": "engineer",
    "11111111-1111-1111-1111-000000000002": "design-lead",
    "11111111-1111-1111-1111-000000000003": "product-lead",
    "11111111-1111-1111-1111-000000000004": "marketing-lead",
    "11111111-1111-1111-1111-000000000005": "qa-auditor",
    "11111111-1111-1111-1111-000000000006": "tech-lead",
    "11111111-1111-1111-1111-000000000007": "frontend-dev",
    "11111111-1111-1111-1111-000000000008": "frontend-dev",
    "11111111-1111-1111-1111-000000000009": "backend-dev",
    "11111111-1111-1111-1111-000000000010": "backend-dev",
    "11111111-1111-1111-1111-000000000014": "product-manager",
  };
  return agentMap[agentId] || "product-lead";
}

/**
 * Trigger an agent to start working on a task
 */
function triggerAgentWork(agentId: string, projectName: string, taskTitle: string): void {
  try {
    const agentName = getAgentNameFromId(agentId);
    const message = `New task assigned for project "${projectName}": ${taskTitle}. Please start working on this task and update the task status to "in_progress" when you begin.`;
    
    // Trigger agent asynchronously (don't wait for response)
    const cmd = `openclaw agent --agent ${agentName} --message '${message.replace(/'/g, "'")}' --timeout 5 &`;
    execSync(cmd, { encoding: 'utf8', timeout: 5000 });
    console.log(`[Triggered] ${agentName} for task: ${taskTitle}`);
  } catch (e) {
    // Log but don't fail the request
    console.error(`[Trigger] Failed to trigger agent ${agentId}:`, e);
  }
}

/**
 * Create GitHub repository for development projects
 */
async function createGitHubRepo(projectName: string, projectId: string): Promise<string | null> {
  const repoName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  
  try {
    // Check if gh is authenticated
    execSync('gh auth status', { encoding: 'utf8', timeout: 5000 });
    
    // Create repo (private, with .gitignore for Node/Next.js)
    const cmd = `gh repo create projectmrwaffles/${repoName} --private --clone=false --gitignore Node`;
    execSync(cmd, { encoding: 'utf8', timeout: 10000 });
    
    console.log(`[GitHub] Created repo: projectmrwaffles/${repoName}`);
    return `https://github.com/projectmrwaffles/${repoName}`;
  } catch (e) {
    console.error(`[GitHub] Failed to create repo:`, e);
    return null;
  }
}

/**
 * Check if all tasks are done and update project status
 */
async function checkAndCompleteProject(db: any, projectId: string): Promise<void> {
  const { data: tasks } = await db
    .from("sprint_items")
    .select("status")
    .eq("project_id", projectId);
  
  if (!tasks || tasks.length === 0) return;
  
  const allDone = tasks.every((t: any) => t.status === "done");
  const anyInProgress = tasks.some((t: any) => t.status === "in_progress");
  
  if (allDone && tasks.length > 0) {
    await db
      .from("projects")
      .update({ status: "completed", progress_pct: 100 })
      .eq("id", projectId);
    
    // Log completion event
    await db.from("agent_events").insert({
      agent_id: null,
      project_id: projectId,
      event_type: "project_completed",
      payload: { message: "All tasks completed" },
    });
    
    console.log(`[Project] Marked as completed: ${projectId}`);
  } else if (anyInProgress) {
    // Update progress percentage
    const doneCount = tasks.filter((t: any) => t.status === "done").length;
    const progress = Math.round((doneCount / tasks.length) * 100);
    await db
      .from("projects")
      .update({ progress_pct: progress })
      .eq("id", projectId);
  }
}

/**
 * Heuristic fallback when AI agent is unavailable
 */
/**
 * Estimate AI workload based on teams working in parallel
 * Returns the quickest time for AI agents to complete
 */
function estimateWorkloadFromTeams(teamIds: string[]): { 
  complexity: string; 
  hours: number; 
  reasoning: string;
} {
  if (teamIds.length === 0) {
    return { complexity: "low", hours: 0.25, reasoning: "No teams assigned" };
  }
  
  // Each team has base minutes for AI to complete their task
  const teamMinutes = teamIds.map(id => TEAM_BASE_MINUTES[id] || 15);
  const maxTeamMinutes = Math.max(...teamMinutes);
  
  // Teams work in parallel, so time is based on longest team work
  // Add 30% buffer for AI iteration/refinement
  const totalMinutes = Math.ceil(maxTeamMinutes * 1.3);
  const hours = Math.round(totalMinutes / 60 * 10) / 10; // Round to 1 decimal
  
  const complexity = teamIds.length > 3 ? "high" : teamIds.length > 1 ? "medium" : "low";
  
  return { 
    complexity,
    hours: Math.max(0.25, hours), // Minimum 15 min
    reasoning: `${teamIds.length} AI agents parallel, ~${totalMinutes}min each + 30% buffer`
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

// Base minutes per team type for AI agents (AI works faster than humans)
// These are estimates for AI to complete initial team task
const TEAM_BASE_MINUTES: Record<string, number> = {
  [TEAMS.ENGINEERING]: 30, // Setup + architecture
  [TEAMS.DESIGN]: 20,      // Wireframes
  [TEAMS.PRODUCT]: 15,     // Requirements
  [TEAMS.MARKETING]: 15,   // Strategy
  [TEAMS.QA]: 20,          // Test plan
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    
    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    let query = db.from("projects").select("id, name, status, type, description, created_at, updated_at").order("created_at", { ascending: false });
    
    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ projects: data });
  } catch (e: unknown) {
    console.error("[API /projects GET] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

        // Trigger the assigned agent to start working
        triggerAgentWork(leadMember.agent_id, name, teamTask);

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

    // Create GitHub repo for development projects
    const devTypes = ["saas", "web_app", "native_app"];
    let githubUrl: string | null = null;
    if (devTypes.includes(type)) {
      githubUrl = await createGitHubRepo(name, project.id);
      if (githubUrl) {
        await db.from("projects").update({ description: `${description || ""}\n\n🔗 GitHub: ${githubUrl}` }).eq("id", project.id);
      }
    }

    return NextResponse.json({ project: { ...project, github_url: githubUrl }, sprint, workload }, { status: 201 });
  } catch (e: unknown) {
    console.error("[API /projects] exception:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
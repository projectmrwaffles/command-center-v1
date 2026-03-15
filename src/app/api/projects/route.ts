import { ensureDefaultSprint, getProjectTaskPosition, syncProjectState } from "@/lib/project-state";
import { createRouteHandlerClient } from "@/lib/supabase-server";
import { getAutoRouteTeamIdsFromIntake, type ProjectIntake } from "@/lib/project-intake";
import { sanitizeProjectLinks } from "@/lib/project-links";
import { NextRequest, NextResponse } from "next/server";

/**
 * Get agent name from ID
 */
function getAgentNameFromId(agentId: string): string {
  // Map DB agent IDs to OpenClaw agent names (from openclaw agents list)
  const agentMap: Record<string, string> = {
    "11111111-1111-1111-1111-000000000001": "main",              // Mr. Waffles (main orchestrator)
    "11111111-1111-1111-1111-000000000002": "product-lead",
    "11111111-1111-1111-1111-000000000003": "head-of-design",
    "11111111-1111-1111-1111-000000000004": "product-designer-app",
    "11111111-1111-1111-1111-000000000005": "web-designer-marketing",
    "11111111-1111-1111-1111-000000000006": "tech-lead-architect",
    "11111111-1111-1111-1111-000000000007": "frontend-engineer",
    "11111111-1111-1111-1111-000000000008": "backend-engineer",
    "11111111-1111-1111-1111-000000000009": "mobile-engineer",
    "11111111-1111-1111-1111-000000000010": "seo-web-developer",
    "11111111-1111-1111-1111-000000000011": "growth-lead",
    "11111111-1111-1111-1111-000000000012": "marketing-producer",
    "11111111-1111-1111-1111-000000000013": "marketing-ops-analytics",
    "11111111-1111-1111-1111-000000000014": "qa-auditor",
  };
  return agentMap[agentId] || "product-lead";
}

/**
 * Trigger an agent to start working on a task via Supabase Realtime.
 * This replaces the old approach of running `openclaw agent` on the server.
 * Instead, we send a notification via the /api/agent/trigger endpoint
 * which broadcasts to the agent listener running on the Mac mini.
 */
async function triggerAgentWork(
  agentId: string, 
  projectName: string, 
  taskTitle: string,
  taskId: string
): Promise<void> {
  try {
    const agentName = getAgentNameFromId(agentId);
    
    // Get the base URL from environment - try multiple sources
    const vercelUrl = process.env.VERCEL_URL;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (vercelUrl ? `https://${vercelUrl}` : "https://command-center-v1.vercel.app");
    
    // Skip trigger in dev mode (localhost) - only trigger in production
    if (!baseUrl) {
      console.log(`[Trigger] Skipping - no production URL configured`);
      return;
    }
    
    // Call our new trigger API endpoint
    const response = await fetch(`${baseUrl}/api/agent/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId,
        taskId,
        projectName,
        taskTitle,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Trigger] API error: ${response.status} - ${errorText}`);
      return;
    }

    await response.json();
    console.log(`[Trigger] Notified agent ${agentName} (${agentId}) for task: ${taskTitle}`);
  } catch (e) {
    console.error(`[Trigger] Failed to trigger agent ${agentId}:`, e);
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

// Legacy fallback routing for older callers that only send type
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
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    
    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    let query = db.from("projects").select("id, name, status, type, description, intake_summary, progress_pct, links, created_at, updated_at").order("created_at", { ascending: false });
    
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

    // Auto-route using composable intake when present, else legacy type routing
    const autoTeamIds = teamId
      ? [teamId]
      : intake
        ? getAutoRouteTeamIdsFromIntake(intake, TEAMS)
        : getAutoRouteTeamIds(type);
    const primaryTeamId = autoTeamIds[0];

    // Calculate workload for planning purposes (but don't create sprints)
    const workload = estimateWorkloadFromTeams(autoTeamIds);
    console.log(`[Workload Analysis] ${name}: ${workload.hours}h (${workload.complexity}) - ${workload.reasoning}`);

    // Create project. Some deployed DBs do not have the newer `links` column yet,
    // so retry without it instead of failing intake entirely.
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

    const firstInsert = await db
      .from("projects")
      .insert({
        ...projectInsertBase,
        links: sanitizedLinks,
      })
      .select()
      .single();

    project = firstInsert.data;
    error = firstInsert.error;

    if (error?.code === "PGRST204" && error.message.includes("'links' column")) {
      const fallbackInsert = await db
        .from("projects")
        .insert(projectInsertBase)
        .select()
        .single();
      project = fallbackInsert.data;
      error = fallbackInsert.error;
    }

    if (error || !project) {
      console.error("[API /projects] insert error:", error);
      return NextResponse.json({ error: error?.message || "Failed to create project", code: error?.code }, { status: 500 });
    }

    // Add team-specific tasks for each team. Some deployed DBs still require sprint_id,
    // so we provision a fallback kickoff sprint when needed.
    const teamTaskTemplates: Record<string, string> = {
      [TEAMS.ENGINEERING]: "Set up development environment and architecture",
      [TEAMS.DESIGN]: "Create initial wireframes and design system",
      [TEAMS.PRODUCT]: "Define product requirements and user stories",
      [TEAMS.MARKETING]: "Plan marketing strategy and messaging",
      [TEAMS.QA]: "Create test plan and quality criteria",
    };
    const kickoffSprintId = await ensureDefaultSprint(db, project.id);
    let nextTaskPosition = await getProjectTaskPosition(db, project.id);

    for (const teamId of autoTeamIds) {
      const { data: teamMembers } = await db
        .from("team_members")
        .select("agent_id, role")
        .eq("team_id", teamId)
        .order("role", { ascending: true });

      if (teamMembers?.length) {
        const teamTask = teamTaskTemplates[teamId] || `Work on ${name}`;
        const leadMember = teamMembers.find((member: { role?: string }) => member.role === "lead") || teamMembers[0];

        // Insert task and capture the returned ID
        const { data: createdTask, error: taskError } = await db
          .from("sprint_items")
          .insert({
            sprint_id: kickoffSprintId,
            project_id: project.id,
            title: teamTask,
            status: "todo",
            assignee_agent_id: leadMember.agent_id,
            position: nextTaskPosition,
          })
          .select("id")
          .single();

        if (taskError) {
          console.error("[API /projects] task insert error:", taskError);
        } else {
          nextTaskPosition += 1;
        }

        if (createdTask?.id) {
          // Trigger the assigned agent to start working (now async with taskId)
          triggerAgentWork(leadMember.agent_id, name, teamTask, createdTask.id);
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
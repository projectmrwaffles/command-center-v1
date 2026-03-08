import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * Heuristic fallback when AI agent is unavailable
 */
function analyzeWorkloadFallback(name: string, type: string, description: string | null): { 
  complexity: string; 
  hours: number; 
  reasoning: string;
} {
  const text = `${name} ${description || ""}`.toLowerCase();
  
  const highComplexity = ["ai", "ml", "machine learning", "database", "backend", "api", "authentication", "payment", "stripe", "real-time", "realtime", "websocket", "mobile", "ios", "android", "native", "security", "complex", "full-stack", "e-commerce", "admin"];
  const lowComplexity = ["simple", "basic", "landing", "marketing", "blog", "static", "demo", "test", "prototype", "mockup", "wireframe"];
  
  let highCount = highComplexity.filter(w => text.includes(w)).length;
  let lowCount = lowComplexity.filter(w => text.includes(w)).length;
  
  const typeBase: Record<string, number> = { saas: 8, web_app: 6, native_app: 10, marketing: 4, other: 4 };
  let baseHours = typeBase[type] || 4;
  
  if (highCount > lowCount) {
    baseHours = Math.min(baseHours + (highCount - lowCount) * 2, 16);
  } else if (lowCount > highCount) {
    baseHours = Math.max(baseHours - (lowCount - highCount), 2);
  }
  
  return { 
    complexity: highCount > lowCount ? "high" : lowCount > highCount ? "low" : "medium",
    hours: Math.max(2, Math.min(baseHours, 16)),
    reasoning: `Analyzed: ${highCount} complex indicators, ${lowCount} simple`
  };
}

/**
 * Invoke the product-lead agent to analyze project workload
 * Returns: { complexity, hours, reasoning }
 */
async function analyzeWorkloadWithAI(name: string, type: string, description: string | null): Promise<{ 
  complexity: string; 
  hours: number; 
  reasoning: string;
}> {
  const prompt = `Analyze this project and respond with ONLY valid JSON:
{"complexity": "low|medium|high", "estimated_hours": number, "reasoning": "text"}
Project: name="${name}", type="${type}", description="${description || ""}"`;

  try {
    const cmd = `openclaw agent --agent product-lead --message '${prompt.replace(/'/g, "'")}' --json --timeout 30`;
    const result = execSync(cmd, { encoding: 'utf8', timeout: 30000, maxBuffer: 512 * 1024 });
    const response = JSON.parse(result);
    const text = response?.result?.payloads?.[0]?.text;
    
    if (text) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          complexity: parsed.complexity || "medium",
          hours: Math.max(2, Math.min(parsed.estimated_hours || 8, 16)),
          reasoning: parsed.reasoning || "AI analysis completed"
        };
      }
    }
    throw new Error("No parseable JSON");
  } catch (e: any) {
    console.error("[Workload Analysis] Agent failed:", e.message);
    // Use fallback instead of failing
    return analyzeWorkloadFallback(name, type, description);
  }
}

// Teams IDs
const TEAMS = {
  ENGINEERING: "11111111-1111-1111-1111-000000000001",
  DESIGN: "11111111-1111-1111-1111-000000000002",
  PRODUCT: "11111111-1111-1111-1111-000000000003",
  MARKETING: "11111111-1111-1111-1111-000000000004",
  QA: "11111111-1111-1111-1111-000000000005",
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

    // Invoke product-lead agent to analyze workload
    const workload = await analyzeWorkloadWithAI(name, type, description || null);
    console.log(`[Workload Analysis] ${name}: ${workload.hours}h (${workload.complexity}) - ${workload.reasoning}`);

    // Auto-route to team based on type (if no team specified)
    const autoTeamIds = teamId ? [teamId] : getAutoRouteTeamIds(type);
    const primaryTeamId = autoTeamIds[0]; // For backward compatibility

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

    // Add team members from ALL assigned teams
    for (const teamId of autoTeamIds) {
      const { data: teamMembers } = await db
        .from("team_members")
        .select("agent_id")
        .eq("team_id", teamId);

      if (teamMembers?.length) {
        // Create initial task for each team member
        for (const member of teamMembers) {
          await db.from("sprint_items").insert({
            sprint_id: sprint?.id,
            project_id: project.id,
            title: `Initial planning: ${name}`,
            status: "todo",
            assignee_agent_id: member.agent_id,
            position: 1,
          });
        }

        // Log team_assigned event
        await db.from("agent_events").insert({
          agent_id: null,
          project_id: project.id,
          event_type: "team_assigned",
          payload: {
            team_id: teamId,
            member_count: teamMembers.length,
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
  } catch (e: any) {
    console.error("[API /projects] exception:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
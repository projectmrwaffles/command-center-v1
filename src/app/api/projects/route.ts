import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * Invoke the product-lead agent to analyze project workload
 * Returns: { complexity, hours, reasoning }
 */
async function analyzeWorkloadWithAI(name: string, type: string, description: string | null): Promise<{ 
  complexity: string; 
  hours: number; 
  reasoning: string;
}> {
  const prompt = `Analyze this project and respond with ONLY valid JSON (no other text):
{
  "complexity": "low" | "medium" | "high",
  "estimated_hours": number between 2-16,
  "reasoning": "short sentence explaining your estimate"
}

Project details:
- name: ${name}
- type: ${type}
- description: ${description || "(none)"}`;

  try {
    // Call product-lead agent via CLI
    const cmd = `openclaw agent --agent product-lead --message '${prompt.replace(/'/g, "\\'")}' --json`;
    const result = execSync(cmd, { 
      encoding: 'utf8', 
      timeout: 60000,
      maxBuffer: 1024 * 1024
    });
    
    const response = JSON.parse(result);
    const text = response?.result?.payloads?.[0]?.text;
    
    if (text) {
      // Try to extract JSON from the response
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
    
    // Fallback if parsing fails
    console.error("[Workload Analysis] Failed to parse agent response:", text);
    throw new Error("Failed to parse agent response");
    
  } catch (e: any) {
    console.error("[Workload Analysis] Agent invocation failed:", e.message);
    // Fallback to heuristic if agent fails
    return {
      complexity: "medium",
      hours: 6,
      reasoning: "Fallback: using default estimate due to agent error"
    };
  }
}

// Auto-route projects to teams based on type
function getAutoRouteTeamId(type: string): string | undefined {
  const teamMap: Record<string, string | undefined> = {
    saas: "11111111-1111-1111-1111-000000000001", // Engineering
    web_app: "11111111-1111-1111-1111-000000000001", // Engineering
    native_app: "11111111-1111-1111-1111-000000000001", // Engineering
    marketing: "11111111-1111-1111-1111-000000000004", // Marketing
    other: undefined,
  };
  return teamMap[type] || undefined;
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
    const autoTeamId = teamId || getAutoRouteTeamId(type);

    // Create project
    const { data: project, error } = await db
      .from("projects")
      .insert({
        name,
        type,
        team_id: autoTeamId,
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
        team_id: autoTeamId,
        description: description || null,
        sprint_id: sprint?.id || null,
        workload_analysis: workload,
      },
    });

    if (eventError) {
      console.error("[API /projects] event log error:", eventError);
    }

    // Add team members to project if team assigned
    if (autoTeamId) {
      const { data: teamMembers } = await db
        .from("team_members")
        .select("agent_id")
        .eq("team_id", autoTeamId);

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
            team_id: autoTeamId,
            member_count: teamMembers.length,
          },
        });
      }
    }

    return NextResponse.json({ project, sprint, workload }, { status: 201 });
  } catch (e: any) {
    console.error("[API /projects] exception:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
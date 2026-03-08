import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// Estimate project complexity and sprint hours based on type
function getProjectComplexity(type: string): { complexity: string; hours: number } {
  const complexityMap: Record<string, { complexity: string; hours: number }> = {
    saas: { complexity: "high", hours: 8 },
    web_app: { complexity: "medium", hours: 6 },
    native_app: { complexity: "high", hours: 8 },
    marketing: { complexity: "low", hours: 4 },
    other: { complexity: "medium", hours: 4 },
  };
  return complexityMap[type] || { complexity: "medium", hours: 4 };
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

    // Auto-create initial sprint (same-day, 4 hours)
    const sprintName = "Sprint 1";
    const startDate = new Date().toISOString().split("T")[0];
    const endDate = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().split("T")[0]; // 4 hours from now

    const { data: sprint, error: sprintError } = await db
      .from("sprints")
      .insert({
        project_id: project.id,
        name: sprintName,
        goal: "Initial setup and planning",
        start_date: startDate,
        end_date: endDate,
        status: "active",
      })
      .select()
      .single();

    if (sprintError) {
      console.error("[API /projects] sprint insert error:", sprintError);
      // Non-fatal, continue
    }

    // Log project_created event
    const { error: eventError } = await db.from("agent_events").insert({
      agent_id: null, // System event
      project_id: project.id,
      event_type: "project_created",
      payload: {
        name,
        type,
        team_id: autoTeamId,
        description: description || null,
        sprint_id: sprint?.id || null,
      },
    });

    if (eventError) {
      console.error("[API /projects] event log error:", eventError);
      // Non-fatal, continue
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

    return NextResponse.json({ project, sprint }, { status: 201 });
  } catch (e: any) {
    console.error("[API /projects] exception:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

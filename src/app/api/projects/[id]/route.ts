import { createRouteHandlerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const params = await ctx.params;
    const projectId = params.id;

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Fetch project
    const { data: project, error: projectError } = await db
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Fetch sprints
    const { data: sprints } = await db
      .from("sprints")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    // Fetch sprint_items (tasks)
    const { data: tasks } = await db
      .from("sprint_items")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true });

    // Fetch teams for this project
    const { data: projectTeams } = await db
      .from("team_members")
      .select("team_id, teams(id, name)")
      .eq("project_id", projectId);

    const teams = projectTeams?.map((pt: any) => pt.teams).flat() || [];

    // Fetch team members with agent info
    const teamIds = teams.map((t: any) => t?.id).filter(Boolean);
    let teamMembers: any[] = [];
    if (teamIds.length > 0) {
      const { data: members } = await db
        .from("team_members")
        .select("*, agents(name, title, status, last_seen)")
        .in("team_id", teamIds)
        .eq("project_id", projectId);
      teamMembers = members || [];
    }

    // Get team stats per team
    const teamsWithStats = teams.map((team: any) => {
      const members = teamMembers.filter((m: any) => m.team_id === team?.id);
      const activeAgents = members.filter((m: any) => m.agents?.status === "active").length;
      const teamTasks = tasks?.filter((t: any) => t.assignee_agent_id && members.some((m: any) => m.agent_id === t.assignee_agent_id)) || [];
      const blockedTasks = teamTasks.filter((t: any) => t.status === "blocked").length;
      const inProgressTasks = teamTasks.filter((t: any) => t.status === "in_progress").length;
      
      let status = "waiting";
      if (blockedTasks > 0) status = "blocked";
      else if (inProgressTasks > 0) status = "active";
      else if (teamTasks.length > 0) status = "on_track";

      return {
        ...team,
        memberCount: members.length,
        activeAgents,
        taskCount: teamTasks.length,
        blockedTasks,
        status,
        members: members.map((m: any) => m.agents).filter(Boolean),
      };
    });

    // Calculate milestone-like aggregates from sprints
    const milestones = sprints?.map((sprint: any) => ({
      id: sprint.id,
      name: sprint.name,
      goal: sprint.goal,
      status: sprint.status,
      progress_pct: sprint.progress_pct,
      start_date: sprint.start_date,
      end_date: sprint.end_date,
    })) || [];

    // Calculate overall progress
    const totalTasks = tasks?.length || 0;
    const doneTasks = tasks?.filter((t: any) => t.status === "done").length || 0;
    const overallProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : project.progress_pct || 0;

    return NextResponse.json({
      project: {
        ...project,
        progress_pct: overallProgress,
      },
      teams: teamsWithStats,
      milestones,
      sprints: sprints || [],
      tasks: tasks || [],
      stats: {
        totalTasks,
        doneTasks,
        blockedTasks: tasks?.filter((t: any) => t.status === "blocked").length || 0,
        inProgressTasks: tasks?.filter((t: any) => t.status === "in_progress").length || 0,
      },
    });
  } catch (e: any) {
    console.error("[API /projects/:id] exception:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const params = await ctx.params;
    const projectId = params.id;
    const body = await req.json();
    const { status } = body;

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    if (!["active", "paused", "completed", "archived"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data, error } = await db
      .from("projects")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .select()
      .single();

    if (error) {
      console.error("[API /projects/:id] update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ project: data });
  } catch (e: any) {
    console.error("[API /projects/:id] exception:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const params = await ctx.params;
    const projectId = params.id;

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Soft delete using deleted_at
    const { data, error } = await db
      .from("projects")
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", projectId)
      .select()
      .single();

    if (error) {
      console.error("[API /projects/:id] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ project: data });
  } catch (e: any) {
    console.error("[API /projects/:id] exception:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

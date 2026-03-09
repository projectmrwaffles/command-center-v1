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

    // Fetch project events (activity timeline)
    const { data: events } = await db
      .from("agent_events")
      .select("id, event_type, payload, timestamp, agents(name)")
      .eq("project_id", projectId)
      .order("timestamp", { ascending: false })
      .limit(50);

    // Fetch teams for this project
    const { data: projectTeams } = await db
      .from("team_members")
      .select("team_id, teams(id, name)")
      .eq("project_id", projectId);

    interface TeamWithId {
  id: string;
  name: string;
}

interface TeamMemberWithAgent {
  team_id: string;
  agent_id: string | null;
  agents: {
    name: string;
    title: string | null;
    status: string;
    last_seen: string | null;
  } | null;
}

const teams: TeamWithId[] = (projectTeams?.map((pt) => pt.teams).flat().filter(Boolean) as TeamWithId[]) || [];
    const teamIds = teams.map((t) => t?.id).filter(Boolean) as string[];
    let teamMembers: TeamMemberWithAgent[] = [];
    if (teamIds.length > 0) {
      const { data: members } = await db
        .from("team_members")
        .select("*, agents(name, title, status, last_seen)")
        .in("team_id", teamIds)
        .eq("project_id", projectId);
      teamMembers = (members || []) as TeamMemberWithAgent[];
    }

    // Get team stats per team
    const teamsWithStats = teams.map((team) => {
      const members = teamMembers.filter((m) => m.team_id === team?.id);
      const activeAgents = members.filter((m) => m.agents?.status === "active").length;
      const teamTasks = tasks?.filter((t) => t.assignee_agent_id && members.some((m) => m.agent_id === t.assignee_agent_id)) || [];
      const blockedTasks = teamTasks.filter((t) => t.status === "blocked").length;
      const inProgressTasks = teamTasks.filter((t) => t.status === "in_progress").length;
      
      let teamStatus = "waiting";
      if (blockedTasks > 0) teamStatus = "blocked";
      else if (inProgressTasks > 0) teamStatus = "active";
      else if (teamTasks.length > 0) teamStatus = "on_track";

      return {
        ...team,
        memberCount: members.length,
        activeAgents,
        taskCount: teamTasks.length,
        blockedTasks,
        status: teamStatus,
        members: members.map((m) => m.agents).filter(Boolean),
      };
    });

    // Calculate milestone-like aggregates from sprints
    const milestones = sprints?.map((sprint) => ({
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
    const doneTasks = tasks?.filter((t) => t.status === "done").length || 0;
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
      events: events || [],
      stats: {
        totalTasks,
        doneTasks,
        blockedTasks: tasks?.filter((t) => t.status === "blocked").length || 0,
        inProgressTasks: tasks?.filter((t) => t.status === "in_progress").length || 0,
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
    const params = await ctx.params;
    const projectId = params.id;

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const db = createRouteHandlerClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Get all related records to cascade delete
    const [sprintsRes, jobsRes, approvalsRes] = await Promise.all([
      db.from("sprints").select("id").eq("project_id", projectId),
      db.from("jobs").select("id").eq("project_id", projectId),
      db.from("approvals").select("id").eq("project_id", projectId),
    ]);

    const sprintIds = sprintsRes.data?.map(s => s.id) ?? [];
    const jobIds = jobsRes.data?.map(j => j.id) ?? [];
    const approvalIds = approvalsRes.data?.map(a => a.id) ?? [];

    // Delete in order (respecting FK constraints)
    if (approvalIds.length > 0) {
      await db.from("approvals").delete().in("id", approvalIds);
    }
    if (sprintIds.length > 0) {
      await db.from("sprint_items").delete().in("sprint_id", sprintIds);
      await db.from("sprints").delete().in("id", sprintIds);
    }
    if (jobIds.length > 0) {
      await db.from("ai_usage").delete().in("job_id", jobIds);
      await db.from("jobs").delete().in("id", jobIds);
    }
    await db.from("ai_usage").delete().eq("project_id", projectId);
    await db.from("agent_events").delete().eq("project_id", projectId);

    // Now delete the project
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

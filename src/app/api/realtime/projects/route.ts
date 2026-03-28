import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { buildProjectTruthIndex } from "@/lib/project-summary-truth";
import { authorizeApiRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
  if (!auth.ok) return auth.response;

  const db = createServerClient();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  let { data, error } = await db
    .from("projects")
    .select("id, name, status, type, team_id, progress_pct, created_at, updated_at, links")
    .order("created_at", { ascending: false });

  if (error?.code === "PGRST204" && error.message.includes("'links' column")) {
    const fallback = await db
      .from("projects")
      .select("id, name, status, type, team_id, progress_pct, created_at, updated_at")
      .order("created_at", { ascending: false });
    data = (fallback.data ?? []).map((project) => ({ ...project, links: null }));
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const projects = data ?? [];
  const projectIds = projects.map((project) => project.id).filter(Boolean);
  if (projectIds.length === 0) return NextResponse.json({ projects });

  const [{ data: tasks, error: tasksError }, { data: sprints, error: sprintsError }, { data: jobs, error: jobsError }] = await Promise.all([
    db.from("sprint_items").select("project_id, sprint_id, status, task_type, task_metadata").in("project_id", projectIds),
    db.from("sprints").select("id, project_id, auto_generated, phase_key, approval_gate_required, approval_gate_status").in("project_id", projectIds),
    db.from("jobs").select("project_id, status").in("project_id", projectIds).in("status", ["queued", "in_progress", "blocked"]),
  ]);

  if (tasksError || sprintsError || jobsError) {
    return NextResponse.json({ error: tasksError?.message || sprintsError?.message || jobsError?.message || "Failed to resolve project progress truth" }, { status: 500 });
  }

  const projectTruthById = buildProjectTruthIndex({
    projects,
    tasks: tasks ?? [],
    sprints: sprints ?? [],
    jobs: jobs ?? [],
  });

  return NextResponse.json({
    projects: projects.map((project) => ({
      ...project,
      progress_pct: projectTruthById.get(project.id)?.progressPct ?? project.progress_pct ?? 0,
      truth: projectTruthById.get(project.id) ?? null,
    })),
  });
}

import { createServerClient, isMockMode } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";
import { DbBanner } from "@/components/db-banner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const db = createServerClient();
  let projects: { id: string; name: string; type: string | null; team_id: string | null }[] | null = null;
  let teams: { id: string; name: string }[] = [];
  let error: { message: string; details?: string } | null = null;

  if (!db) {
    return (
      <div className="space-y-6">
        <DbBanner />
        <ErrorState
          title="DB not initialized"
          message="Supabase env missing or migrations not applied."
          details="Apply migrations in Supabase SQL Editor, then refresh."
        />
      </div>
    );
  }

  try {
    const projectsRes = await db
      .from("projects")
      .select("id, name, type, team_id")
      .order("name");
    projects = (projectsRes.data ?? []) as { id: string; name: string; type: string | null; team_id: string | null }[];

    const teamsRes = await db.from("teams").select("id, name");
    teams = (teamsRes.data ?? []) as { id: string; name: string }[];
  } catch (err) {
    error = {
      message: "Failed to load projects",
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (error) {
    return (
      <div className="space-y-6">
        <DbBanner />
        <ErrorState title="Error" message={error.message} details={error.details} />
      </div>
    );
  }

  const teamsById = new Map<string, string>();
  teams.forEach((t) => teamsById.set(t.id, t.name));

  return (
    <div className="space-y-6">
      <DbBanner />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Projects</h1>
          <p className="text-sm text-zinc-500">Active projects with sprints and PRDs</p>
        </div>
        <Link
          href="/projects/new"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Project
        </Link>
      </div>

      <div className="grid gap-4">
        {(projects || []).map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="block">
            <Card className="hover:bg-zinc-50">
              <CardHeader className="pb-2">
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>
                  {p.type ?? "Project"}
                  {p.team_id && teamsById.get(p.team_id) && ` • ${teamsById.get(p.team_id)}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-500">View project details →</p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {(projects || []).length === 0 && (
          <p className="text-sm text-zinc-500">No projects yet.</p>
        )}
      </div>
    </div>
  );
}

import { DbBanner } from "@/components/db-banner";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type Team = {
  id: string;
  name: string;
  description: string | null;
};

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServerClient();

  let team: Team | null = null;
  let memberCount = 0;
  let projectCount = 0;
  let error: string | null = null;

  if (db) {
    try {
      const teamRes = await db.from("teams").select("id, name, description").eq("id", id).single();
      team = (teamRes.data ?? null) as Team | null;

      const membersRes = await db.from("team_members").select("id").eq("team_id", id);
      memberCount = (membersRes.data ?? []).length;

      const projectsRes = await db.from("projects").select("id").eq("team_id", id);
      projectCount = (projectsRes.data ?? []).length;
    } catch (err: any) {
      error = err?.message ?? "Unknown error";
    }
  }

  return (
    <div className="space-y-6">
      <DbBanner />

      {error && (
        <ErrorState title="Error loading team" message={error} details="Apply migrations if tables are missing." />
      )}

      {!team && !error && (
        <ErrorState title="Team not found" message="This team does not exist (or DB not initialized)." />
      )}

      {team && (
        <>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">{team.name}</h1>
            <p className="text-sm text-zinc-500">{team.description ?? "—"}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Members</CardDescription>
                <CardTitle className="text-2xl">{memberCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Projects</CardDescription>
                <CardTitle className="text-2xl">{projectCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Needs you</CardDescription>
                <CardTitle className="text-2xl">—</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Rollups</CardTitle>
              <CardDescription>Usage and approvals rollups will appear here.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-500">Coming next in V1: usage by team, active projects, needs-you counts.</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

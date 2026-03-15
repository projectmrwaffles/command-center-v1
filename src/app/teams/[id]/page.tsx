import Link from "next/link";
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

function formatEventType(eventType: string) {
  return eventType.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServerClient();

  let team: Team | null = null;
  let members: any[] = [];
  let projects: any[] = [];
  let approvals: any[] = [];
  let events: any[] = [];
  let error: string | null = null;

  if (db) {
    try {
      const teamRes = await db.from("teams").select("id, name, description").eq("id", id).single();
      team = (teamRes.data ?? null) as Team | null;

      const membersRes = await db
        .from("team_members")
        .select("agent_id, agents(id, name, title, status, last_seen)")
        .eq("team_id", id);
      members = membersRes.data ?? [];

      const projectsRes = await db
        .from("projects")
        .select("id, name, status, progress_pct, updated_at")
        .eq("team_id", id)
        .order("updated_at", { ascending: false });
      projects = projectsRes.data ?? [];

      const projectIds = projects.map((project) => project.id);
      if (projectIds.length > 0) {
        const approvalsRes = await db
          .from("approvals")
          .select("id, summary, severity, status, project_id, created_at")
          .in("project_id", projectIds)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(10);
        approvals = approvalsRes.data ?? [];

        const eventsRes = await db
          .from("agent_events")
          .select("id, event_type, payload, project_id, timestamp")
          .in("project_id", projectIds)
          .order("timestamp", { ascending: false })
          .limit(12);
        events = eventsRes.data ?? [];
      }
    } catch (err: any) {
      error = err?.message ?? "Unknown error";
    }
  }

  const memberAgents = members.map((member) => (Array.isArray(member.agents) ? member.agents[0] : member.agents)).filter(Boolean);
  const activeMembers = memberAgents.filter((agent) => agent.status === "active").length;
  const averageProgress = projects.length > 0 ? Math.round(projects.reduce((sum, project) => sum + (project.progress_pct || 0), 0) / projects.length) : 0;

  return (
    <div className="space-y-6">
      <DbBanner />

      {error && <ErrorState title="Error loading team" message={error} details="Apply migrations if tables are missing." />}
      {!team && !error && <ErrorState title="Team not found" message="This team does not exist (or DB not initialized)." />}

      {team && (
        <>
          <div className="space-y-2">
            <Link href="/teams" className="text-sm text-zinc-500 hover:text-zinc-700">← Back to teams</Link>
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">{team.name}</h1>
              <p className="text-sm text-zinc-500">{team.description ?? "No team description yet."}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardDescription>Members</CardDescription><CardTitle className="text-2xl">{memberAgents.length}</CardTitle></CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Active now</CardDescription><CardTitle className="text-2xl text-green-600">{activeMembers}</CardTitle></CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Projects</CardDescription><CardTitle className="text-2xl">{projects.length}</CardTitle></CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Avg. progress</CardDescription><CardTitle className="text-2xl">{averageProgress}%</CardTitle></CardHeader>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>Projects</CardTitle>
                <CardDescription>What this team is actively responsible for.</CardDescription>
              </CardHeader>
              <CardContent>
                {projects.length === 0 ? (
                  <p className="text-sm text-zinc-500">No projects assigned.</p>
                ) : (
                  <div className="space-y-3">
                    {projects.map((project) => (
                      <Link key={project.id} href={`/projects/${project.id}`} className="block rounded-xl border border-zinc-200 p-4 transition hover:border-zinc-300 hover:shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-900">{project.name}</p>
                            <p className="mt-1 text-xs text-zinc-500">Status: {project.status}</p>
                          </div>
                          <span className="text-xs text-zinc-500">{project.progress_pct || 0}%</span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                          <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-600" style={{ width: `${project.progress_pct || 0}%` }} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>Who is available right now.</CardDescription>
                </CardHeader>
                <CardContent>
                  {memberAgents.length === 0 ? (
                    <p className="text-sm text-zinc-500">No members found.</p>
                  ) : (
                    <div className="space-y-3">
                      {memberAgents.map((agent) => (
                        <div key={agent.id} className="rounded-xl border border-zinc-200 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-zinc-900">{agent.name}</p>
                              <p className="text-xs text-zinc-500">{agent.title || "Agent"}</p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${agent.status === "active" ? "bg-green-100 text-green-700" : agent.status === "idle" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-700"}`}>{agent.status}</span>
                          </div>
                          {agent.last_seen && <p className="mt-2 text-[11px] text-zinc-400">Last seen {new Date(agent.last_seen).toLocaleString()}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Signals</CardTitle>
                  <CardDescription>Approvals and project activity for this team.</CardDescription>
                </CardHeader>
                <CardContent>
                  {approvals.length === 0 && events.length === 0 ? (
                    <p className="text-sm text-zinc-500">No recent signals.</p>
                  ) : (
                    <div className="space-y-3">
                      {approvals.map((approval) => (
                        <div key={approval.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <p className="text-sm font-medium text-amber-900">{approval.summary || "Approval requested"}</p>
                          <p className="mt-1 text-xs text-amber-700">{approval.severity || "medium"} priority • {new Date(approval.created_at).toLocaleString()}</p>
                        </div>
                      ))}
                      {events.slice(0, 6).map((event) => (
                        <div key={event.id} className="rounded-xl border border-zinc-200 p-3">
                          <p className="text-sm font-medium text-zinc-900">{formatEventType(event.event_type)}</p>
                          <p className="mt-1 text-xs text-zinc-500">{event.payload?.title || event.payload?.message || "Recent project activity"}</p>
                          <p className="mt-1 text-[11px] text-zinc-400">{new Date(event.timestamp).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

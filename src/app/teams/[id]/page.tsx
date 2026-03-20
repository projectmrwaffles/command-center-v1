import Link from "next/link";
import { Activity, ArrowLeft, ArrowRight, FolderKanban, Sparkles, Users } from "lucide-react";
import { DbBanner } from "@/components/db-banner";
import { ErrorState } from "@/components/error-state";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { PageHero, PageHeroStat } from "@/components/ui/page-hero";
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

function statusClasses(status?: string | null) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "idle") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-700";
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
          <PageHero>
            <div className="flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-4">
                <Link
                  href="/teams"
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white/85 px-3 py-1.5 text-sm text-zinc-600 shadow-sm transition hover:border-red-200 hover:text-red-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to teams
                </Link>
                <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-700 shadow-sm backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5" />
                  Team detail
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">{team.name}</h1>
                  <p className="max-w-xl text-sm leading-6 text-zinc-600 sm:text-base">
                    {team.description ?? "No team description yet."}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px] lg:grid-cols-2">
                <PageHeroStat className="border-red-100">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                    <Users className="h-4 w-4 text-red-500" />
                    Members
                  </div>
                  <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{memberAgents.length}</div>
                  <p className="mt-1 text-xs text-zinc-500">Assigned to this team.</p>
                </PageHeroStat>
                <PageHeroStat className="border-emerald-100 shadow-[0_8px_24px_rgba(16,185,129,0.08)]">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                    <Activity className="h-4 w-4 text-emerald-500" />
                    Active now
                  </div>
                  <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{activeMembers}</div>
                  <p className="mt-1 text-xs text-zinc-500">Currently marked active.</p>
                </PageHeroStat>
                <PageHeroStat className="border-amber-100 shadow-[0_8px_24px_rgba(245,158,11,0.08)]">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                    <FolderKanban className="h-4 w-4 text-amber-500" />
                    Projects
                  </div>
                  <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{projects.length}</div>
                  <p className="mt-1 text-xs text-zinc-500">Current owned workstreams.</p>
                </PageHeroStat>
                <PageHeroStat className="border-red-100 shadow-[0_8px_24px_rgba(239,68,68,0.08)]">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                    <ArrowRight className="h-4 w-4 text-red-500" />
                    Avg. progress
                  </div>
                  <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{averageProgress}%</div>
                  <p className="mt-1 text-xs text-zinc-500">Across assigned projects.</p>
                </PageHeroStat>
              </div>
            </div>
          </PageHero>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card variant="soft" className="rounded-[24px] border-red-100/70 bg-[radial-gradient(circle_at_top_left,rgba(254,242,242,0.72),rgba(255,255,255,0.98)_52%,rgba(255,247,237,0.88)_100%)]">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <div className="space-y-2">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-red-100 bg-white/85 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-red-700">
                    Projects
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-950">What this team is actively responsible for.</h2>
                    <p className="mt-1 text-sm text-zinc-500">Open each project to inspect status, progress, and detailed execution.</p>
                  </div>
                </div>

                {projects.length === 0 ? (
                  <BrandedEmptyState
                    icon={<FolderKanban className="h-8 w-8 text-red-600" />}
                    title="No projects assigned"
                    description="Projects connected to this team will appear here once they’re linked in the workspace."
                    className="px-5 py-12"
                  />
                ) : (
                  <div className="space-y-3">
                    {projects.map((project) => (
                      <Link key={project.id} href={`/projects/${project.id}`} className="group block">
                        <Card variant="featured" className="overflow-hidden rounded-[22px]">
                          <CardContent className="space-y-4 p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-base font-semibold tracking-tight text-zinc-950">{project.name}</p>
                                <div className="mt-2 inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-600">
                                  Status: {project.status}
                                </div>
                              </div>
                              <span className="shrink-0 text-sm font-medium text-zinc-600">{project.progress_pct || 0}%</span>
                            </div>
                            <div className="space-y-2">
                              <div className="h-2 overflow-hidden rounded-full bg-red-100/70">
                                <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-500 transition-all" style={{ width: `${project.progress_pct || 0}%` }} />
                              </div>
                              <div className="flex items-center justify-between text-xs text-zinc-500">
                                <span>Progress</span>
                                <span className="inline-flex items-center gap-1 font-medium text-red-700">
                                  Open project
                                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card variant="soft" className="rounded-[24px]">
                <CardContent className="space-y-5 p-5 sm:p-6">
                  <div className="space-y-2">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-red-100 bg-red-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-red-700">
                      Team members
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">Who is available right now.</h2>
                      <p className="mt-1 text-sm text-zinc-500">Presence and last-seen data for everyone assigned to this team.</p>
                    </div>
                  </div>

                  {memberAgents.length === 0 ? (
                    <BrandedEmptyState
                      icon={<Users className="h-8 w-8 text-red-600" />}
                      title="No members found"
                      description="Team members will show up here once people or agents are assigned."
                      className="px-5 py-12"
                    />
                  ) : (
                    <div className="space-y-3">
                      {memberAgents.map((agent) => (
                        <div key={agent.id} className="rounded-[22px] border border-zinc-200 bg-white/90 p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-zinc-950">{agent.name}</p>
                              <p className="mt-1 text-xs text-zinc-500">{agent.title || "Agent"}</p>
                            </div>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${statusClasses(agent.status)}`}>
                              {agent.status}
                            </span>
                          </div>
                          {agent.last_seen ? (
                            <p className="mt-3 text-[11px] text-zinc-400">Last seen {new Date(agent.last_seen).toLocaleString()}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card variant="soft" className="rounded-[24px]">
                <CardContent className="space-y-5 p-5 sm:p-6">
                  <div className="space-y-2">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-100 bg-amber-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-700">
                      Recent signals
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">Approvals and project activity for this team.</h2>
                      <p className="mt-1 text-sm text-zinc-500">Pending approvals are surfaced first, followed by the latest project events.</p>
                    </div>
                  </div>

                  {approvals.length === 0 && events.length === 0 ? (
                    <BrandedEmptyState
                      icon={<Sparkles className="h-8 w-8 text-red-600" />}
                      title="No recent signals"
                      description="Approvals and notable activity will appear here as this team starts moving work through the system."
                      className="px-5 py-12"
                    />
                  ) : (
                    <div className="space-y-3">
                      {approvals.map((approval) => (
                        <div key={approval.id} className="rounded-[22px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,1),rgba(255,255,255,0.98))] p-4 shadow-sm">
                          <div className="inline-flex rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-700">
                            Pending approval
                          </div>
                          <p className="mt-3 text-sm font-semibold text-amber-950">{approval.summary || "Approval requested"}</p>
                          <p className="mt-2 text-xs text-amber-700">{approval.severity || "medium"} priority • {new Date(approval.created_at).toLocaleString()}</p>
                        </div>
                      ))}
                      {events.slice(0, 6).map((event) => (
                        <div key={event.id} className="rounded-[22px] border border-zinc-200 bg-white/90 p-4 shadow-sm">
                          <p className="text-sm font-semibold text-zinc-950">{formatEventType(event.event_type)}</p>
                          <p className="mt-2 text-xs leading-5 text-zinc-500">{event.payload?.title || event.payload?.message || "Recent project activity"}</p>
                          <p className="mt-2 text-[11px] text-zinc-400">{new Date(event.timestamp).toLocaleString()}</p>
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

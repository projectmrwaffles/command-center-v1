import Link from "next/link";
import { Activity, ArrowLeft, ArrowRight, FolderKanban, Sparkles, Users } from "lucide-react";
import { DbBanner } from "@/components/db-banner";
import { ErrorState } from "@/components/error-state";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  EntityCard,
  EntityCardAction,
  EntityCardAvatar,
  EntityCardFooterCta,
  EntityCardHeader,
  EntityCardIdentity,
  EntityCardMetric,
  EntityCardStatus,
  EntityCardSubtitle,
  EntityCardTitle,
} from "@/components/ui/entity-card";
import { PageHero, PageHeroStat } from "@/components/ui/page-hero";
import { createServerClient } from "@/lib/supabase-server";
import { formatEventType, formatLastSeen, getAgentDisplayName, getAgentEmoji, getAgentStatusLabel, statusClasses } from "@/app/agents/agent-utils";

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
                    Active at load
                  </div>
                  <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{activeMembers}</div>
                  <p className="mt-1 text-xs text-zinc-500">Marked active when this page was loaded.</p>
                </PageHeroStat>
                <PageHeroStat className="border-red-100 shadow-[0_8px_24px_rgba(239,68,68,0.08)]">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                    <FolderKanban className="h-4 w-4 text-red-500" />
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
            <Card variant="soft" className="rounded-[24px] border-red-100/70 bg-[radial-gradient(circle_at_top_left,rgba(254,242,242,0.72),rgba(255,255,255,0.98)_52%,rgba(255,241,242,0.88)_100%)]">
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
                                <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-rose-500 transition-all" style={{ width: `${project.progress_pct || 0}%` }} />
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
                      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">Who was available at load time.</h2>
                      <p className="mt-1 text-sm text-zinc-500">Load-time presence and last-seen data for everyone assigned to this team.</p>
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
                        <EntityCard key={agent.id} accent="zinc">
                          <EntityCardHeader>
                            <EntityCardIdentity>
                              <div className="flex items-center gap-3">
                                <EntityCardAvatar className="h-10 w-10 text-xl">
                                  <span aria-hidden="true">{getAgentEmoji(agent.name)}</span>
                                </EntityCardAvatar>
                                <div className="min-w-0">
                                  <EntityCardTitle className="text-base">{getAgentDisplayName(agent.name)}</EntityCardTitle>
                                  <EntityCardSubtitle>{agent.title || "Agent"}</EntityCardSubtitle>
                                </div>
                              </div>
                              <EntityCardStatus className={statusClasses(agent.status)}>
                                {getAgentStatusLabel(agent.status)}
                              </EntityCardStatus>
                            </EntityCardIdentity>
                            <EntityCardAction accent="zinc" />
                          </EntityCardHeader>
                          <EntityCardMetric accent="zinc" className="mt-auto">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Last seen</p>
                            <p className="mt-1 text-sm text-zinc-700">{formatLastSeen(agent.last_seen)}</p>
                          </EntityCardMetric>
                        </EntityCard>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card variant="soft" className="rounded-[24px]">
                <CardContent className="space-y-5 p-5 sm:p-6">
                  <div className="space-y-2">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-red-100 bg-red-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-red-700">
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
                        <EntityCard key={approval.id} accent="amber">
                          <EntityCardHeader>
                            <EntityCardIdentity>
                              <EntityCardStatus className="border-amber-200 bg-white text-amber-700">Pending approval</EntityCardStatus>
                              <EntityCardTitle className="text-base text-amber-950">{approval.summary || "Approval requested"}</EntityCardTitle>
                              <EntityCardSubtitle className="text-amber-700">
                                {(approval.severity || "medium").toString()} priority
                              </EntityCardSubtitle>
                            </EntityCardIdentity>
                          </EntityCardHeader>
                          <EntityCardMetric accent="amber" className="mt-auto">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-700">Requested</p>
                            <p className="mt-1 text-sm text-amber-900">{new Date(approval.created_at).toLocaleString()}</p>
                          </EntityCardMetric>
                        </EntityCard>
                      ))}
                      {events.slice(0, 6).map((event) => (
                        <EntityCard key={event.id} accent="zinc">
                          <EntityCardHeader>
                            <EntityCardIdentity>
                              <EntityCardTitle className="text-base">{formatEventType(event.event_type)}</EntityCardTitle>
                              <EntityCardSubtitle className="line-clamp-3 leading-5 text-zinc-500">
                                {event.payload?.title || event.payload?.message || "Recent project activity"}
                              </EntityCardSubtitle>
                            </EntityCardIdentity>
                          </EntityCardHeader>
                          <EntityCardMetric accent="zinc" className="mt-auto flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Observed</p>
                              <p className="mt-1 text-sm text-zinc-700">{new Date(event.timestamp).toLocaleString()}</p>
                            </div>
                            <EntityCardFooterCta className="text-zinc-600">Recent signal</EntityCardFooterCta>
                          </EntityCardMetric>
                        </EntityCard>
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

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Briefcase,
  Layers3,
  Plus,
  Radio,
  Sparkles,
  Users2,
  Workflow,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import { PageHero, PageHeroStat } from "@/components/ui/page-hero";
import { DashboardData } from "./page";
import { useRealtimeStore } from "@/lib/realtime-store";
import { CreateProjectModal } from "@/components/create-project-modal";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

function StatusDot({ status }: { status: string }) {
  const color = status === "active" ? "bg-emerald-500" : status === "idle" ? "bg-zinc-400" : "bg-zinc-400";
  return <span className={cn("h-2.5 w-2.5 rounded-full", color)} />;
}

function SeverityBadge({ severity }: { severity?: string }) {
  if (!severity) return null;
  const classes: Record<string, string> = {
    low: "border-zinc-200 bg-zinc-100 text-zinc-600",
    medium: "border-amber-200 bg-amber-50 text-amber-700",
    high: "border-orange-200 bg-orange-50 text-orange-700",
    critical: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]", classes[severity] ?? classes.medium)}>
      {severity}
    </span>
  );
}

function BentoBadge({ children, color }: { children: React.ReactNode; color: "red" | "amber" | "blue" | "green" }) {
  const styles = {
    red: "border-red-200 bg-red-50 text-red-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  return <span className={cn("rounded-full border px-2 py-1 text-[11px] font-medium", styles[color])}>{children}</span>;
}

function SectionTitle({ children, meta }: { children: React.ReactNode; meta?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">{children}</h2>
      {meta ? <p className="text-sm text-zinc-500">{meta}</p> : null}
    </div>
  );
}

type NeedsYouItem = {
  id: string;
  type: "approval" | "blocked" | "error";
  title: string;
  severity?: string;
  projectId?: string;
  agentId?: string;
  jobId?: string;
  createdAt: string;
};

type ProjectCardModel = {
  id: string;
  name: string;
  type?: string;
  teamName?: string;
  progress_pct: number;
  approvalCount?: number;
  blockedCount?: number;
};

type UsageModel = {
  totalTokens: number;
  totalCost: number;
  topModels: { model: string; provider: string; tokens: number; cost: number }[];
};

type SignalItem = {
  id: string;
  kind: "approval" | "blocked" | "active" | "project";
  title: string;
  detail: string;
  timestamp: string;
};

function eventTitle(eventType: string) {
  return eventType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function OverviewClient({ initialData }: { initialData: DashboardData }) {
  const replaceAgents = useRealtimeStore((s) => s.replaceAgents);
  const upsertProject = useRealtimeStore((s) => s.upsertProject);
  const upsertApproval = useRealtimeStore((s) => s.upsertApproval);
  const prependEvent = useRealtimeStore((s) => s.prependEvent);
  const upsertTeam = useRealtimeStore((s) => s.upsertTeam);

  useEffect(() => {
    replaceAgents(initialData.agents as any);
    initialData.projects.forEach((p: any) => upsertProject({ ...p, progress_pct: p.activeSprint?.progress ?? p.progress_pct ?? 0 }));
    initialData.needsYou.forEach((n: any) => {
      if (n.type === "approval") {
        upsertApproval({
          id: n.id,
          status: "pending",
          summary: n.title,
          severity: n.severity,
          project_id: n.projectId,
          agent_id: n.agentId,
          job_id: n.jobId,
          created_at: n.createdAt,
        });
      }
    });
    initialData.events?.forEach((e: any) => prependEvent(e));
    initialData.teams?.forEach((t: any) => upsertTeam(t));
  }, [initialData, prependEvent, replaceAgents, upsertApproval, upsertProject, upsertTeam]);

  const agentsById = useRealtimeStore((s) => s.agentsById);
  const projectsById = useRealtimeStore((s) => s.projectsById);
  const approvalsById = useRealtimeStore((s) => s.approvalsById);
  const jobsById = useRealtimeStore((s) => s.jobsById);
  const usageRollup = useRealtimeStore((s) => s.usageRollup);
  const teamsById = useRealtimeStore((s) => s.teamsById);
  const storeEvents = useRealtimeStore((s) => s.events);

  const [selectedNeedsYou, setSelectedNeedsYou] = useState<NeedsYouItem | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const connectionStatus = "connected" as const;

  const agents = useMemo(() => Array.from(agentsById.values()), [agentsById]);
  const jobs = useMemo(() => Array.from(jobsById.values()), [jobsById]);
  const teams = useMemo(() => (initialData.teams && initialData.teams.length > 0 ? initialData.teams : Array.from(teamsById.values())), [initialData.teams, teamsById]);
  const events = useMemo(() => (storeEvents.length > 0 ? storeEvents : initialData.events || []), [initialData.events, storeEvents]);
  const pendingApprovals = useMemo(() => Array.from(approvalsById.values()).filter((a) => a.status === "pending"), [approvalsById]);
  const blockedJobs = useMemo(() => jobs.filter((j) => j.status === "blocked"), [jobs]);
  const activeAgents = useMemo(() => agents.filter((agent) => agent.status === "active").length, [agents]);

  const usage24h = useMemo(() => {
    if (initialData.usage && initialData.usage.totalTokens24h > 0) {
      return {
        totalTokens: initialData.usage.totalTokens24h,
        totalCost: initialData.usage.totalCost24h,
        topModels: (initialData.usage.topModels || []).map((m: any) => ({
          model: m.model,
          provider: m.model?.split("/")[0] || "openrouter",
          tokens: m.tokens,
          cost: m.cost,
        })),
      };
    }

    const rows = Array.from(usageRollup.values());
    const totalTokens = rows.reduce((sum, row) => sum + (row.tokens || 0), 0);
    const totalCost = rows.reduce((sum, row) => sum + (row.cost_usd || 0), 0);
    const byModel = new Map<string, { model: string; provider: string; tokens: number; cost: number }>();
    rows.forEach((row) => {
      const key = `${row.provider}:${row.model}`;
      const existing = byModel.get(key) || { model: row.model, provider: row.provider, tokens: 0, cost: 0 };
      existing.tokens += row.tokens || 0;
      existing.cost += row.cost_usd || 0;
      byModel.set(key, existing);
    });
    return { totalTokens, totalCost, topModels: Array.from(byModel.values()).sort((a, b) => b.tokens - a.tokens).slice(0, 5) };
  }, [initialData.usage, usageRollup]);

  const needsYou: NeedsYouItem[] = useMemo(() => {
    const approvals = pendingApprovals.map((ap) => ({
      id: ap.id,
      type: "approval" as const,
      title: ap.summary || "Approval requested",
      severity: ap.severity,
      projectId: ap.project_id,
      agentId: ap.agent_id,
      jobId: ap.job_id,
      createdAt: ap.created_at,
    }));
    const blocked = blockedJobs.map((job) => ({
      id: job.id,
      type: "blocked" as const,
      title: job.title || "Blocked job",
      projectId: job.project_id,
      agentId: job.owner_agent_id,
      jobId: job.id,
      createdAt: new Date().toISOString(),
    }));
    return [...approvals, ...blocked].slice(0, 20);
  }, [blockedJobs, pendingApprovals]);

  const projectCards: ProjectCardModel[] = useMemo(() => {
    const approvalsByProject = new Map<string, number>();
    pendingApprovals.forEach((approval) => {
      if (!approval.project_id) return;
      approvalsByProject.set(approval.project_id, (approvalsByProject.get(approval.project_id) ?? 0) + 1);
    });
    const blockedByProject = new Map<string, number>();
    blockedJobs.forEach((job) => {
      if (!job.project_id) return;
      blockedByProject.set(job.project_id, (blockedByProject.get(job.project_id) ?? 0) + 1);
    });
    return Array.from(projectsById.values()).map((project: any) => ({
      id: project.id,
      name: project.name,
      type: project.type,
      teamName: project.teamName,
      progress_pct: project.progress_pct ?? 0,
      approvalCount: approvalsByProject.get(project.id) ?? 0,
      blockedCount: blockedByProject.get(project.id) ?? 0,
    }));
  }, [blockedJobs, pendingApprovals, projectsById]);

  const recentSignals: SignalItem[] = useMemo(() => {
    const projectNameFor = (projectId?: string) => {
      if (!projectId) return null;
      return projectsById.get(projectId)?.name || null;
    };

    const fromApprovals = pendingApprovals.slice(0, 4).map((approval) => ({
      id: `approval-${approval.id}`,
      kind: "approval" as const,
      title: approval.summary || "Approval requested",
      detail: projectNameFor(approval.project_id)
        ? `${projectNameFor(approval.project_id)} needs a decision.`
        : "A decision is waiting.",
      timestamp: approval.created_at,
    }));

    const fromJobs = jobs.slice(0, 4).map((job) => ({
      id: `job-${job.id}`,
      kind: job.status === "blocked" ? ("blocked" as const) : ("active" as const),
      title: job.title || eventTitle(job.status),
      detail: [
        projectNameFor(job.project_id),
        job.status === "blocked" ? "delivery is blocked right now" : `status: ${job.status.replace(/_/g, " ")}`,
      ]
        .filter(Boolean)
        .join(" • "),
      timestamp: new Date().toISOString(),
    }));

    const fromEvents = events.slice(0, 8).map((event: any) => ({
      id: `event-${event.id}`,
      kind: event.type?.includes("project") ? ("project" as const) : ("active" as const),
      title: event.label || eventTitle(event.event_type || event.type || "activity"),
      detail: [event.projectName, event.actorName].filter(Boolean).join(" • ") || "Recent system activity",
      timestamp: event.timestamp,
    }));

    return [...fromApprovals, ...fromJobs, ...fromEvents]
      .filter((signal) => signal.detail)
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
      .slice(0, 8);
  }, [events, jobs, pendingApprovals, projectsById]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHero>
        <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700">
              <Sparkles className="h-3.5 w-3.5 text-red-500" />
              Ops command center
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Dashboard</h1>
              <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
                Keep the overview up top: what needs a decision, which projects are moving, and whether the live operator feed is healthy.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <PageHeroStat className="border-red-100">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-red-700">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Needs you
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{needsYou.length}</div>
              </PageHeroStat>
              <PageHeroStat className="border-rose-100">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-rose-700">
                  <Layers3 className="h-4 w-4 text-rose-500" />
                  Active projects
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{projectCards.length}</div>
              </PageHeroStat>
              <PageHeroStat className="border-emerald-100">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
                  <Bot className="h-4 w-4 text-emerald-500" />
                  Agents active
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{activeAgents}</div>
              </PageHeroStat>
              <PageHeroStat className="border-red-100">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-red-700">
                  <Workflow className="h-4 w-4 text-red-500" />
                  Signals
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{recentSignals.length}</div>
              </PageHeroStat>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[290px] lg:items-end">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4 lg:max-w-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <Radio className={cn("h-4 w-4", connectionStatus === "connected" ? "text-emerald-500" : connectionStatus === "connecting" ? "text-amber-500" : "text-red-500")} />
                {connectionStatus === "connected" ? "Live updates on" : connectionStatus === "connecting" ? "Connecting live feed..." : "Live feed offline"}
              </div>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                Open a new project from the dashboard while the overview stays focused on approvals, projects, teams, and usage.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => setShowCreateProject(true)} size="lg" variant="warm" className="min-h-12 w-full justify-center rounded-xl px-5 text-base sm:flex-1 sm:text-sm">
                  <Plus className="h-4 w-4" />
                  New project
                </Button>
                <Link
                  href="/projects"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-6 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                >
                  <Briefcase className="h-4 w-4" />
                  All projects
                </Link>
              </div>
            </div>
            <p className="px-1 text-xs text-zinc-500">{teams.length} teams • {usage24h.totalTokens.toLocaleString()} tokens in the last 24h</p>
          </div>
        </div>
      </PageHero>

      <CreateProjectModal open={showCreateProject} onOpenChange={setShowCreateProject} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle meta="Approvals and blocked work that need operator attention right now.">Needs You ({needsYou.length})</SectionTitle>
              {needsYou.length > 0 ? <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">Priority queue</span> : null}
            </div>

            {needsYou.length === 0 ? (
              <BrandedEmptyState
                className="items-start px-6 py-10 text-left"
                icon={<AlertTriangle className="h-7 w-7 text-red-600" />}
                title="Nothing is waiting on you"
                description="There are no pending approvals or blocked jobs at the moment, so the queue is clear for now."
              />
            ) : (
              <div className="space-y-3">
                {needsYou.slice(0, 5).map((item) => (
                  <Card key={item.id} variant="featured" className="cursor-pointer rounded-[24px]" onClick={() => setSelectedNeedsYou(item)}>
                    <CardContent className="flex items-start justify-between gap-3 p-5">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", item.type === "approval" ? "bg-amber-100 text-amber-700" : item.type === "blocked" ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-700")}>
                            {item.type}
                          </span>
                          {item.severity && <SeverityBadge severity={item.severity} />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-zinc-950">{item.title}</p>
                          <p className="mt-1 text-sm text-zinc-500">Open the detail drawer for ids, routing context, and next operator action.</p>
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-xs text-zinc-400">{timeAgo(item.createdAt)}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle meta="Fresh system activity, approvals, and project movement in one stream.">Recent Signals</SectionTitle>
            </div>
            {recentSignals.length === 0 ? (
              <BrandedEmptyState
                className="items-start px-6 py-10 text-left"
                icon={<Activity className="h-7 w-7 text-red-600" />}
                title="No recent signals"
                description="Once approvals, jobs, and events start flowing, the latest signal feed will collect them here."
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {recentSignals.map((signal) => (
                  <div key={signal.id} className="rounded-[24px] border border-zinc-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-red-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", signal.kind === "approval" ? "bg-amber-100 text-amber-700" : signal.kind === "blocked" ? "bg-red-100 text-red-700" : signal.kind === "project" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700")}>
                            {signal.kind}
                          </span>
                          <p className="truncate text-sm font-semibold text-zinc-950">{signal.title}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">{signal.detail}</p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-zinc-400">{timeAgo(signal.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle meta="Active project health, progress, and any open flags.">Active Projects ({projectCards.length})</SectionTitle>
              <Link href="/projects" className="text-sm font-medium text-red-700 transition-colors hover:text-red-800">
                View all
              </Link>
            </div>
            {projectCards.length === 0 ? (
              <BrandedEmptyState
                className="items-start px-6 py-10 text-left"
                icon={<Layers3 className="h-7 w-7 text-red-600" />}
                title="No active projects yet"
                description="Create a project to start routing work, tracking progress, and surfacing dashboard health here."
                action={
                  <Button onClick={() => setShowCreateProject(true)} size="lg" variant="warm" className="rounded-xl px-5">
                    <Plus className="h-4 w-4" />
                    Create project
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {projectCards.map((project) => <ProjectCard key={project.id} project={project} />)}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <SectionTitle meta="AI usage and top models over the last 24 hours.">Usage (24h)</SectionTitle>
            <UsageCard usage={usage24h} />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle meta="Team availability, project load, and approvals needing attention.">Teams ({teams.length})</SectionTitle>
              <Link href="/teams" className="text-sm font-medium text-red-700 transition-colors hover:text-red-800">View all</Link>
            </div>

            {teams.length === 0 ? (
              <BrandedEmptyState
                className="items-start px-6 py-10 text-left"
                icon={<Users2 className="h-7 w-7 text-red-600" />}
                title="No teams yet"
                description="Teams will show up here with online coverage, project counts, and pending approvals once configured."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {teams.slice(0, 6).map((team, index) => {
                  const teamAgents = agents.filter((agent: any) => agent.primary_team_id === team.id);
                  const onlineCount = teamAgents.filter((agent) => agent.status === "active").length;
                  const teamProjects = Array.from(projectsById.values()).filter((project: any) => project.team_id === team.id);
                  const teamApprovals = pendingApprovals.filter((approval) => {
                    if (!approval.project_id) return false;
                    const proj = projectsById.get(approval.project_id);
                    return proj?.team_id === team.id;
                  });
                  const teamStatus = onlineCount > 0 ? "active" : teamAgents.some((agent) => agent.status === "idle") ? "idle" : "offline";
                  const isFeatured = index === 0;

                  return (
                    <Link key={team.id} href={`/teams/${team.id}`} className="block">
                      <Card variant={isFeatured ? "featured" : "soft"} className={cn("rounded-[24px]", isFeatured && "overflow-hidden")}>
                                                <CardContent className={cn("flex flex-col justify-between", isFeatured ? "gap-4 p-5" : "gap-3 p-4")}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <StatusDot status={teamStatus} />
                              <p className={cn("font-semibold tracking-tight text-zinc-950", isFeatured ? "text-base" : "text-sm")}>{team.name}</p>
                            </div>
                            <span className="text-xs text-zinc-400">{teamStatus}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <BentoBadge color={onlineCount > 0 ? "green" : "red"}>{onlineCount}/{teamAgents.length} online</BentoBadge>
                            <BentoBadge color="blue">{teamProjects.length} projects</BentoBadge>
                            {teamApprovals.length > 0 ? <BentoBadge color="amber">{teamApprovals.length} pending</BentoBadge> : null}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {selectedNeedsYou && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setSelectedNeedsYou(null)}>
          <div className="w-full max-w-md bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Details</h3>
              <button onClick={() => setSelectedNeedsYou(null)} className="rounded p-1 hover:bg-zinc-100">✕</button>
            </div>
            <pre className="mt-4 max-h-full overflow-auto rounded border bg-zinc-50 p-3 text-xs text-zinc-700">{JSON.stringify(selectedNeedsYou, null, 2)}</pre>
            <div className="mt-4 flex items-center gap-2">
              <Link href="/approvals" className="flex-1 rounded-md bg-red-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-red-700">Go to Approvals</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectCardModel }) {
  const progress = project.progress_pct ?? 0;
  const hasFlags = (project.approvalCount ?? 0) + (project.blockedCount ?? 0) > 0;

  return (
    <Link href={`/projects/${project.id}`} className="group block rounded-[24px] focus:outline-none focus:ring-2 focus:ring-red-200">
      <Card variant="featured" className="relative h-full rounded-[24px] overflow-hidden">
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-red-700">{project.name}</p>
              <p className="mt-1 text-sm text-zinc-500">
                {project.type ? <span className="uppercase tracking-[0.14em] text-[11px] text-zinc-400">{project.type}</span> : null}
                {project.type && project.teamName ? <span> • </span> : null}
                {project.teamName ? <span>{project.teamName}</span> : null}
              </p>
            </div>
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">{progress}%</span>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Progress</p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">{progress}% complete</p>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", hasFlags ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                {hasFlags ? `${(project.approvalCount ?? 0) + (project.blockedCount ?? 0)} active flags` : "Healthy"}
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-red-100">
              <div className="h-2 rounded-full bg-red-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-auto flex flex-wrap gap-2">
            {(project.approvalCount ?? 0) > 0 ? <span className="inline-flex rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">{project.approvalCount} approvals</span> : null}
            {(project.blockedCount ?? 0) > 0 ? <span className="inline-flex rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">{project.blockedCount} blocked</span> : null}
            {!hasFlags ? <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">No active flags</span> : null}
          </div>

          <div className="flex items-center justify-between border-t border-zinc-100 pt-1 text-sm text-zinc-500">
            <span>Open project workspace</span>
            <span className="inline-flex items-center gap-1 font-medium text-red-700 transition-colors group-hover:text-red-800">
              View project
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function UsageCard({ usage }: { usage: UsageModel }) {
  return (
    <Card variant="soft" className="rounded-[24px] border-zinc-200 bg-white">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-red-700">24h summary</p>
            <p className="mt-2 text-sm text-zinc-500">Usage totals and the models carrying most of the load.</p>
          </div>
          <span className="rounded-full border border-red-100 bg-white px-3 py-1 text-xs font-medium text-red-700">Live rollup</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-red-100 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Tokens</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{usage.totalTokens.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-red-100 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Cost</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">${usage.totalCost.toFixed(4)}</div>
          </div>
        </div>

        {usage.topModels.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Top models</p>
            <div className="space-y-2">
              {usage.topModels.map((model) => (
                <div key={`${model.provider}:${model.model}`} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">{model.model}</p>
                    <p className="text-xs text-zinc-500">{model.provider}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-zinc-900">{model.tokens.toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">${model.cost.toFixed(4)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <BrandedEmptyState
            className="px-6 py-10"
            icon={<Workflow className="h-7 w-7 text-red-600" />}
            title="No usage yet"
            description="Model usage will populate here once jobs begin spending tokens."
          />
        )}
      </CardContent>
    </Card>
  );
}

function timeAgo(ts?: string) {
  if (!ts) return "Not available";
  const then = new Date(ts).getTime();
  const now = Date.now();
  const diff = now - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Briefcase,
  Layers3,
  Plus,
  Radio,
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
  const color = status === "active" ? "bg-success" : status === "idle" ? "bg-text-muted" : "bg-text-muted";
  return <span className={cn("h-2.5 w-2.5 rounded-full", color)} />;
}

function BentoBadge({ children, color }: { children: React.ReactNode; color: "red" | "amber" | "blue" | "green" }) {
  const styles = {
    red: "border-accent/15 bg-accent-soft text-accent-soft-foreground",
    amber: "border-[color:color-mix(in_srgb,var(--color-warning)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_14%,var(--color-panel))] text-[color:color-mix(in_srgb,var(--color-warning)_72%,var(--color-text))]",
    blue: "border-[color:color-mix(in_srgb,var(--color-info)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--color-info)_14%,var(--color-panel))] text-[color:color-mix(in_srgb,var(--color-info)_72%,var(--color-text))]",
    green: "border-[color:color-mix(in_srgb,var(--color-success)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--color-success)_14%,var(--color-panel))] text-[color:color-mix(in_srgb,var(--color-success)_72%,var(--color-text))]",
  };
  return <span className={cn("rounded-full border px-2 py-1 text-[11px] font-medium", styles[color])}>{children}</span>;
}

function SectionTitle({ children, meta }: { children: React.ReactNode; meta?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-text">{children}</h2>
      {meta ? <p className="text-sm text-text-muted">{meta}</p> : null}
    </div>
  );
}

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

export function OverviewClient({ initialData }: { initialData: DashboardData }) {
  const replaceAgents = useRealtimeStore((s) => s.replaceAgents);
  const upsertProject = useRealtimeStore((s) => s.upsertProject);
  const upsertApproval = useRealtimeStore((s) => s.upsertApproval);
  const upsertJob = useRealtimeStore((s) => s.upsertJob);
  const upsertTeam = useRealtimeStore((s) => s.upsertTeam);

  useEffect(() => {
    replaceAgents(initialData.agents as any);
    initialData.projects.forEach((p: any) => upsertProject({ ...p, progress_pct: p.progress_pct ?? p.activeSprint?.progress ?? 0 }));
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
        return;
      }

      if (n.type === "error" && n.jobId) {
        upsertJob({
          id: n.jobId,
          title: n.title,
          status: "blocked",
          project_id: n.projectId,
          owner_agent_id: n.agentId,
        });
      }
    });
    initialData.teams?.forEach((t: any) => upsertTeam(t));
  }, [initialData, replaceAgents, upsertApproval, upsertJob, upsertProject, upsertTeam]);

  const agentsById = useRealtimeStore((s) => s.agentsById);
  const projectsById = useRealtimeStore((s) => s.projectsById);
  const approvalsById = useRealtimeStore((s) => s.approvalsById);
  const jobsById = useRealtimeStore((s) => s.jobsById);
  const usageRollup = useRealtimeStore((s) => s.usageRollup);
  const teamsById = useRealtimeStore((s) => s.teamsById);

  const [showCreateProject, setShowCreateProject] = useState(false);
  const connectionStatus = "connected" as const;

  const agents = useMemo(() => Array.from(agentsById.values()), [agentsById]);
  const jobs = useMemo(() => Array.from(jobsById.values()), [jobsById]);
  const teams = useMemo(() => (initialData.teams && initialData.teams.length > 0 ? initialData.teams : Array.from(teamsById.values())), [initialData.teams, teamsById]);
  const pendingApprovals = useMemo(() => Array.from(approvalsById.values()).filter((a) => a.status === "pending"), [approvalsById]);
  const blockedJobs = useMemo(() => jobs.filter((j) => j.status === "blocked"), [jobs]);
  const activeAgents = useMemo(() => agents.filter((agent) => agent.status === "active").length, [agents]);
  const needsAttentionCount = pendingApprovals.length + blockedJobs.length;

  const usage24h = useMemo(() => {
    if (initialData.usage) {
      return {
        totalTokens: initialData.usage.totalTokens24h,
        totalCost: initialData.usage.totalCost24h,
        topModels: (initialData.usage.topModels || []).map((m: any) => ({
          model: m.model,
          provider: m.model?.split("/")[0] || "unknown",
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
      status: project.status,
      teamName: project.teamName,
      progress_pct: project.progress_pct ?? 0,
      approvalCount: approvalsByProject.get(project.id) ?? project.approvalCount ?? 0,
      blockedCount: blockedByProject.get(project.id) ?? project.blockedCount ?? 0,
      reviewCount: project.reviewCount ?? 0,
      lastUpdate: project.lastUpdate ?? project.updated_at,
    }));
  }, [blockedJobs, pendingApprovals, projectsById]);



  return (
    <div className="space-y-6 md:space-y-8">
      <PageHero>
        <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div className="max-w-3xl space-y-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">Dashboard</h1>
              <p className="max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
                What needs attention, which projects are moving, and where to jump in.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <PageHeroStat className="shadow-none">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary">
                  <AlertTriangle className="h-4 w-4 text-accent" />
                  Needs attention
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-text">{needsAttentionCount}</div>
              </PageHeroStat>
              <PageHeroStat className="shadow-none">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary">
                  <Layers3 className="h-4 w-4 text-accent" />
                  Active work
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-text">{projectCards.length}</div>
              </PageHeroStat>
              <PageHeroStat className="shadow-none">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary">
                  <Bot className="h-4 w-4 text-accent" />
                  Agents active
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-text">{activeAgents}</div>
              </PageHeroStat>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[280px] lg:items-end">
            <div className="rounded-2xl border border-border/70 bg-panel-elevated p-3 shadow-[var(--shadow-panel-soft)] lg:max-w-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <Radio className={cn("h-4 w-4", connectionStatus === "connected" ? "text-accent" : connectionStatus === "connecting" ? "text-warning" : "text-text-muted")} />
                {connectionStatus === "connected" ? "Live updates on" : connectionStatus === "connecting" ? "Connecting live feed..." : "Live feed offline"}
              </div>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                Open a project or jump into the project list.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Button asChild size="lg" variant="warm" className="min-h-12 w-full justify-center rounded-xl px-5 text-base sm:flex-1 sm:text-sm">
                  <Link href="/projects/new">
                    <Plus className="h-4 w-4" />
                    New project
                  </Link>
                </Button>
                <Link
                  href="/projects"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border/75 bg-panel px-6 text-sm font-medium text-text-secondary transition-colors hover:border-accent/25 hover:bg-accent-soft/60 hover:text-text"
                >
                  <Briefcase className="h-4 w-4" />
                  All projects
                </Link>
              </div>
            </div>
            <p className="px-1 text-xs text-text-muted">{teams.length} teams • {usage24h.totalTokens.toLocaleString()} tokens in the last 24h</p>
          </div>
        </div>
      </PageHero>

      <CreateProjectModal open={showCreateProject} onOpenChange={setShowCreateProject} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle meta="Active work, current state, and open flags.">Active Work ({projectCards.length})</SectionTitle>
              <Link href="/projects" className="text-sm font-medium text-text-secondary transition-colors hover:text-accent-strong">
                View all
              </Link>
            </div>
            {projectCards.length === 0 ? (
              <BrandedEmptyState
                className="items-start px-6 py-10 text-left"
                icon={<Layers3 className="h-7 w-7" />}
                title="No active projects yet"
                description="Create a project to start routing work, tracking progress, and surfacing dashboard health here."
                action={
                  <Button asChild size="lg" variant="warm" className="rounded-xl px-5">
                    <Link href="/projects/new">
                      <Plus className="h-4 w-4" />
                      Create project
                    </Link>
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
              <Link href="/teams" className="text-sm font-medium text-text-secondary transition-colors hover:text-accent-strong">View all</Link>
            </div>

            {teams.length === 0 ? (
              <BrandedEmptyState
                className="items-start px-6 py-10 text-left"
                icon={<Users2 className="h-7 w-7" />}
                title="No teams yet"
                description="Teams will show up here with online coverage, project counts, and pending approvals once configured."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {teams.slice(0, 6).map((team) => {
                  const teamAgents = agents.filter((agent: any) => agent.primary_team_id === team.id);
                  const onlineCount = teamAgents.filter((agent) => agent.status === "active").length;
                  const teamProjects = Array.from(projectsById.values()).filter((project: any) => project.team_id === team.id);
                  const teamApprovals = pendingApprovals.filter((approval) => {
                    if (!approval.project_id) return false;
                    const proj = projectsById.get(approval.project_id);
                    return proj?.team_id === team.id;
                  });
                  const teamStatus = onlineCount > 0 ? "active" : teamAgents.some((agent) => agent.status === "idle") ? "idle" : "offline";

                  return (
                    <Link key={team.id} href={`/teams/${team.id}`} className="block">
                      <Card variant="soft" className="rounded-[24px]">
                        <CardContent className="flex flex-col justify-between gap-3 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <StatusDot status={teamStatus} />
                              <p className="text-sm font-semibold tracking-tight text-text">{team.name}</p>
                            </div>
                            <span className="text-xs text-text-muted">{teamStatus}</span>
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

    </div>
  );
}

function ProjectCard({ project }: { project: ProjectCardModel }) {
  const progress = project.progress_pct ?? 0;
  const hasFlags = (project.approvalCount ?? 0) + (project.blockedCount ?? 0) > 0;

  return (
    <Link href={`/projects/${project.id}`} className="group block rounded-[24px] focus:outline-none focus:ring-2 focus:ring-accent/20">
      <Card variant="featured" className="relative h-full rounded-[24px] overflow-hidden">
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight text-text transition-colors group-hover:text-text-secondary">{project.name}</p>
              <p className="mt-1 text-sm text-text-muted">
                {project.type ? <span className="uppercase tracking-[0.14em] text-[11px] text-text-muted">{project.type}</span> : null}
                {project.type && project.teamName ? <span> • </span> : null}
                {project.teamName ? <span>{project.teamName}</span> : null}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-panel-elevated p-4 shadow-[var(--shadow-panel-soft)]">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted">Progress</p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-text">{progress}% complete</p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  hasFlags
                    ? "bg-[color:color-mix(in_srgb,var(--color-warning)_14%,var(--color-panel))] text-[color:color-mix(in_srgb,var(--color-warning)_72%,var(--color-text))]"
                    : "bg-[color:color-mix(in_srgb,var(--color-success)_14%,var(--color-panel))] text-[color:color-mix(in_srgb,var(--color-success)_72%,var(--color-text))]",
                )}
              >
                {hasFlags ? `${(project.approvalCount ?? 0) + (project.blockedCount ?? 0)} active flags` : "Healthy"}
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-accent-soft">
              <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-auto flex flex-wrap gap-2">
            {(project.approvalCount ?? 0) > 0 ? <span className="inline-flex rounded-full border border-accent/15 bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent-soft-foreground">{project.approvalCount} approvals</span> : null}
            {(project.blockedCount ?? 0) > 0 ? <span className="inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--color-warning)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_14%,var(--color-panel))] px-2.5 py-1 text-[11px] font-medium text-[color:color-mix(in_srgb,var(--color-warning)_72%,var(--color-text))]">{project.blockedCount} blocked</span> : null}
            {!hasFlags ? <span className="inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--color-success)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--color-success)_14%,var(--color-panel))] px-2.5 py-1 text-[11px] font-medium text-[color:color-mix(in_srgb,var(--color-success)_72%,var(--color-text))]">No active flags</span> : null}
          </div>

          <div className="flex items-center justify-between border-t border-border/60 pt-1 text-sm text-text-muted">
            <span>Open project workspace</span>
            <span className="inline-flex items-center gap-1 font-medium text-text-secondary transition-colors group-hover:text-accent-strong">
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
    <Card variant="soft" className="rounded-[24px]">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-text-secondary">24h summary</p>
            <p className="mt-2 text-sm text-text-muted">Usage totals and the models carrying most of the load.</p>
          </div>
          <span className="rounded-full border border-accent/15 bg-panel-elevated px-3 py-1 text-xs font-medium text-text-secondary">Live rollup</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-accent/15 bg-panel p-4 shadow-[var(--shadow-panel-soft)]">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted">Tokens</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-text">{usage.totalTokens.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-accent/15 bg-panel p-4 shadow-[var(--shadow-panel-soft)]">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted">Cost</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-text">${usage.totalCost.toFixed(4)}</div>
          </div>
        </div>

        {usage.topModels.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted">Top models</p>
            <div className="space-y-2">
              {usage.topModels.map((model) => (
                <div key={`${model.provider}:${model.model}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-panel px-4 py-3 text-sm shadow-[var(--shadow-panel-soft)]">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text">{model.model}</p>
                    <p className="text-xs text-text-muted">{model.provider}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-text">{model.tokens.toLocaleString()}</p>
                    <p className="text-xs text-text-muted">${model.cost.toFixed(4)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <BrandedEmptyState
            className="px-6 py-10"
            icon={<Workflow className="h-7 w-7" />}
            title="No usage yet"
            description="Model usage will populate here once jobs begin spending tokens."
          />
        )}
      </CardContent>
    </Card>
  );
}


"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardData } from "./page";
import { useRealtimeStore } from "@/lib/realtime-store";
import { subscribeToAllTables } from "@/lib/realtime-subscribe";
import { CreateProjectModal } from "@/components/create-project-modal";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

function StatusDot({ status }: { status: string }) {
  const color = status === "active" ? "bg-green-500" : status === "idle" ? "bg-amber-500" : "bg-zinc-400";
  return <span className={cn("h-2 w-2 rounded-full", color)} />;
}

function SeverityBadge({ severity }: { severity?: string }) {
  if (!severity) return null;
  const classes: Record<string, string> = {
    low: "bg-zinc-100 text-zinc-600",
    medium: "bg-amber-50 text-amber-700",
    high: "bg-orange-50 text-orange-700",
    critical: "bg-red-50 text-red-700",
  };
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", classes[severity] ?? classes.medium)}>{severity}</span>;
}

function BentoBadge({ children, color }: { children: React.ReactNode; color: "red" | "amber" | "blue" | "green" }) {
  const styles = {
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
  };
  return <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium", styles[color])}>{children}</span>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-zinc-900">{children}</h2>;
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
  const store = useRealtimeStore();

  useEffect(() => {
    initialData.agents.forEach((a: any) => store.upsertAgent(a));
    initialData.projects.forEach((p: any) => store.upsertProject({ ...p, progress_pct: p.activeSprint?.progress ?? p.progress_pct ?? 0 }));
    initialData.needsYou.forEach((n: any) => {
      if (n.type === "approval") {
        store.upsertApproval({
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
    initialData.events?.forEach((e: any) => store.prependEvent(e));
    initialData.teams?.forEach((t: any) => store.upsertTeam(t));
  }, [initialData, store]);

  useEffect(() => {
    const sub = subscribeToAllTables({
      onAgent: (p) => {
        if (p.eventType !== "DELETE") store.upsertAgent(p.new);
      },
      onApproval: (p) => {
        if (p.eventType === "DELETE") store.removeApproval(p.old.id);
        else store.upsertApproval(p.new);
      },
      onProject: (p) => {
        if (p.eventType !== "DELETE") store.upsertProject(p.new);
      },
      onSprint: (p) => {
        if (p.eventType !== "DELETE") store.upsertSprint(p.new);
      },
      onJob: (p) => {
        if (p.eventType !== "DELETE") store.upsertJob(p.new);
      },
      onUsageRollup: (p) => {
        if (p.eventType !== "DELETE") store.upsertUsageRollup(p.new);
      },
      onTeam: (p) => {
        if (p.eventType !== "DELETE") store.upsertTeam(p.new);
      },
      onAgentEvent: (p) => {
        if (p.eventType === "INSERT") store.prependEvent(p.new);
      },
    });

    return () => sub.unsubscribeAll();
  }, [store]);

  const agentsById = useRealtimeStore((s) => s.agentsById);
  const projectsById = useRealtimeStore((s) => s.projectsById);
  const approvalsById = useRealtimeStore((s) => s.approvalsById);
  const jobsById = useRealtimeStore((s) => s.jobsById);
  const usageRollup = useRealtimeStore((s) => s.usageRollup);
  const teamsById = useRealtimeStore((s) => s.teamsById);
  const storeEvents = useRealtimeStore((s) => s.events);

  const [selectedNeedsYou, setSelectedNeedsYou] = useState<NeedsYouItem | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  useEffect(() => {
    const timer = setTimeout(() => setConnectionStatus("connected"), 1200);
    return () => clearTimeout(timer);
  }, []);

  const agents = useMemo(() => Array.from(agentsById.values()), [agentsById]);
  const jobs = useMemo(() => Array.from(jobsById.values()), [jobsById]);
  const teams = useMemo(() => (initialData.teams && initialData.teams.length > 0 ? initialData.teams : Array.from(teamsById.values())), [initialData.teams, teamsById]);
  const events = useMemo(() => (storeEvents.length > 0 ? storeEvents : initialData.events || []), [initialData.events, storeEvents]);
  const pendingApprovals = useMemo(() => Array.from(approvalsById.values()).filter((a) => a.status === "pending"), [approvalsById]);
  const blockedJobs = useMemo(() => jobs.filter((j) => j.status === "blocked"), [jobs]);

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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Overview</h1>
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <span className={`h-2 w-2 rounded-full ${connectionStatus === "connected" ? "bg-green-500" : connectionStatus === "connecting" ? "bg-amber-500" : "bg-red-500"}`}></span>
            {connectionStatus === "connected" ? "Live updates on" : connectionStatus === "connecting" ? "Connecting live feed..." : "Live feed offline"}
          </p>
        </div>
        <button onClick={() => setShowCreateProject(true)} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
          New Project
        </button>
      </div>

      <CreateProjectModal open={showCreateProject} onOpenChange={setShowCreateProject} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Needs You ({needsYou.length})</SectionTitle>
            </div>
            {needsYou.length === 0 ? (
              <p className="text-sm text-zinc-500">No pending approvals or blocked items.</p>
            ) : (
              <div className="space-y-3">
                {needsYou.slice(0, 5).map((item) => (
                  <Card key={item.id} className="cursor-pointer border-zinc-200" onClick={() => setSelectedNeedsYou(item)}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900">{item.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] uppercase">{item.type}</span>
                            {item.severity && <SeverityBadge severity={item.severity} />}
                          </div>
                        </div>
                        <span className="whitespace-nowrap text-xs text-zinc-400">{timeAgo(item.createdAt)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Recent Signals</SectionTitle>
            </div>
            {recentSignals.length === 0 ? (
              <p className="text-sm text-zinc-500">No signals yet.</p>
            ) : (
              <div className="space-y-2">
                {recentSignals.map((signal) => (
                  <div key={signal.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium uppercase", signal.kind === "approval" ? "bg-amber-100 text-amber-700" : signal.kind === "blocked" ? "bg-red-100 text-red-700" : signal.kind === "project" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700")}>{signal.kind}</span>
                          <p className="truncate text-sm font-medium text-zinc-900">{signal.title}</p>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">{signal.detail}</p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-zinc-400">{timeAgo(signal.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Active Projects ({projectCards.length})</SectionTitle>
            </div>
            {projectCards.length === 0 ? (
              <p className="text-sm text-zinc-500">No active projects.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {projectCards.map((project) => <ProjectCard key={project.id} project={project} />)}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Usage (24h)</SectionTitle>
            </div>
            <UsageCard usage={usage24h} />
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Teams ({teams.length})</SectionTitle>
              <Link href="/teams" className="text-xs text-red-600 hover:underline">View all</Link>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {teams.slice(0, 6).map((team, index) => {
                const teamAgents = agents.filter((agent) => agent.primary_team_id === team.id);
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
                  <Link key={team.id} href={`/teams/${team.id}`} className={isFeatured ? "col-span-2" : "col-span-1"}>
                    <Card className={cn("cursor-pointer border-zinc-200 transition-all hover:border-zinc-300 hover:shadow-md", isFeatured ? "bg-gradient-to-br from-zinc-50 to-zinc-100" : "bg-white")}>
                      <CardContent className={cn("flex flex-col justify-between", isFeatured ? "p-4 sm:p-5" : "p-3")}>
                        <div className="flex items-center gap-2">
                          <StatusDot status={teamStatus} />
                          <p className={cn("font-medium text-zinc-900", isFeatured ? "text-base" : "text-sm")}>{team.name}</p>
                        </div>
                        <div className={cn("mt-2 flex flex-wrap gap-1.5", isFeatured && "mt-3")}>
                          <BentoBadge color={onlineCount > 0 ? "green" : "red"}>{onlineCount}/{teamAgents.length} online</BentoBadge>
                          <BentoBadge color="blue">{teamProjects.length} projects</BentoBadge>
                          {teamApprovals.length > 0 && <BentoBadge color="amber">{teamApprovals.length} pending</BentoBadge>}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
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
  return (
    <Link href={`/projects/${project.id}`} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-200">
      <Card className="cursor-pointer border-zinc-200 transition-shadow hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-sm font-medium">{project.name}</CardTitle>
              <CardDescription className="mt-0.5">
                {project.type && <span className="text-[10px] uppercase">{project.type}</span>}
                {project.teamName && <span> • {project.teamName}</span>}
              </CardDescription>
            </div>
            <span className="text-[10px] text-zinc-500">{progress}%</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
            <div className="h-2 rounded-full bg-gradient-to-r from-red-500 to-red-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{progress}% complete</span>
            <span>{(project.approvalCount ?? 0) + (project.blockedCount ?? 0)} active flags</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(project.approvalCount ?? 0) > 0 && <span className="inline-flex rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">{project.approvalCount} approvals</span>}
            {(project.blockedCount ?? 0) > 0 && <span className="inline-flex rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">{project.blockedCount} blocked</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function UsageCard({ usage }: { usage: UsageModel }) {
  return (
    <Card className="border-zinc-200">
      <CardHeader className="pb-2">
        <CardDescription>24h summary</CardDescription>
        <div className="mt-2 flex items-baseline gap-6">
          <div>
            <div className="text-sm text-zinc-500">Tokens</div>
            <div className="text-2xl font-semibold">{usage.totalTokens.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Cost</div>
            <div className="text-2xl font-semibold">${usage.totalCost.toFixed(4)}</div>
          </div>
        </div>
      </CardHeader>
      {usage.topModels.length > 0 && (
        <CardContent className="pt-0">
          <p className="mb-2 text-xs font-medium text-zinc-700">Top models</p>
          <div className="space-y-2">
            {usage.topModels.map((model) => (
              <div key={`${model.provider}:${model.model}`} className="flex items-center justify-between text-sm">
                <span className="text-zinc-900">{model.model}</span>
                <span className="text-zinc-500">{model.tokens.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function timeAgo(ts?: string) {
  if (!ts) return "—";
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

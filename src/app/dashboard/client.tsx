"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        classes[severity] ?? classes.medium
      )}
    >
      {severity}
    </span>
  );
}

function drawBadge(content: string, color: "red" | "amber" | "blue" | "green") {
  const styles = {
    red: "bg-red-50 text-red-700 border-red-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-green-50 text-green-700 border-green-100",
  };
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium", styles[color])}>
      {content}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-zinc-900">{children}</h2>;
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
  activeSprint?: { id: string; name: string; progress: number } | null;
  approvalCount?: number;
  blockedCount?: number;
};

type UsageModel = {
  totalTokens: number;
  totalCost: number;
  topModels: { model: string; provider: string; tokens: number; cost: number }[];
};

export function OverviewClient({ initialData }: { initialData: DashboardData }) {
  const store = useRealtimeStore();

  // Seed store with initial SSR data (one-time)
  useEffect(() => {
    initialData.agents.forEach((a: any) => store.upsertAgent(a));
    initialData.projects.forEach((p: any) => store.upsertProject({ ...p, progress_pct: p.activeSprint?.progress ?? 0 }));
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
    // Seed teams from initial data if available
    initialData.teams?.forEach((t: any) => store.upsertTeam(t));
  }, []);

  // Subscribe once (global-ish)
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
    });

    return () => sub.unsubscribeAll();
  }, []);

  // Select stable references (Maps/arrays) and derive computed arrays with useMemo.
  const agentsById = useRealtimeStore((s) => s.agentsById);
  const projectsById = useRealtimeStore((s) => s.projectsById);
  const sprintsById = useRealtimeStore((s) => s.sprintsById);
  const approvalsById = useRealtimeStore((s) => s.approvalsById);
  const jobsById = useRealtimeStore((s) => s.jobsById);
  const usageRollup = useRealtimeStore((s) => s.usageRollup);
  const teamsById = useRealtimeStore((s) => s.teamsById);

  const agents = useMemo(() => Array.from(agentsById.values()), [agentsById]);
  const jobs = useMemo(() => Array.from(jobsById.values()), [jobsById]);
  const teams = useMemo(() => Array.from(teamsById.values()), [teamsById]);

  const pendingApprovals = useMemo(
    () => Array.from(approvalsById.values()).filter((a) => a.status === "pending"),
    [approvalsById]
  );

  const projectsWithSprint = useMemo(() => {
    const sprints = Array.from(sprintsById.values());
    return Array.from(projectsById.values()).map((p: any) => {
      const active = sprints.find((s: any) => s.project_id === p.id && s.status === "active") ?? null;
      return {
        ...p,
        activeSprint: active ? { id: active.id, name: active.name, progress: active.progress_pct } : null,
      };
    });
  }, [projectsById, sprintsById]);

  const usage24h = useMemo(() => {
    const now = Date.now();
    const cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const rows = Array.from(usageRollup.values()).filter((u) => u.bucket_minute >= cutoff);

    const totalTokens = rows.reduce((s, r) => s + (r.tokens || 0), 0);
    const totalCost = rows.reduce((s, r) => s + (r.cost_usd || 0), 0);

    const byModel = new Map<string, { model: string; provider: string; tokens: number; cost: number }>();
    for (const r of rows) {
      const key = `${r.provider}:${r.model}`;
      const ex = byModel.get(key) || { model: r.model, provider: r.provider, tokens: 0, cost: 0 };
      ex.tokens += r.tokens || 0;
      ex.cost += r.cost_usd || 0;
      byModel.set(key, ex);
    }

    const topModels = Array.from(byModel.values())
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5);

    return { totalTokens, totalCost, topModels };
  }, [usageRollup]);

  const blockedJobs = useMemo(() => jobs.filter((j) => j.status === "blocked"), [jobs]);

  const needsYou: NeedsYouItem[] = useMemo(() => {
    const a = pendingApprovals.map((ap) => ({
      id: ap.id,
      type: "approval" as const,
      title: ap.summary || "Approval requested",
      severity: ap.severity,
      projectId: ap.project_id,
      agentId: ap.agent_id,
      jobId: ap.job_id,
      createdAt: ap.created_at,
    }));

    const b = blockedJobs.map((j) => ({
      id: j.id,
      type: "blocked" as const,
      title: j.title || "Blocked job",
      projectId: j.project_id,
      agentId: j.owner_agent_id,
      jobId: j.id,
      createdAt: new Date().toISOString(),
    }));

    return [...a, ...b].slice(0, 20);
  }, [pendingApprovals, blockedJobs]);

  const projectCards: ProjectCardModel[] = useMemo(() => {
    const approvalsByProject = new Map<string, number>();
    pendingApprovals.forEach((a) => {
      if (!a.project_id) return;
      approvalsByProject.set(a.project_id, (approvalsByProject.get(a.project_id) ?? 0) + 1);
    });

    const blockedByProject = new Map<string, number>();
    blockedJobs.forEach((j) => {
      if (!j.project_id) return;
      blockedByProject.set(j.project_id, (blockedByProject.get(j.project_id) ?? 0) + 1);
    });

    return projectsWithSprint.map((p: any) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      teamName: p.teamName,
      progress_pct: p.progress_pct ?? 0,
      activeSprint: p.activeSprint,
      approvalCount: approvalsByProject.get(p.id) ?? 0,
      blockedCount: blockedByProject.get(p.id) ?? 0,
    }));
  }, [projectsWithSprint, pendingApprovals, blockedJobs]);

  const [selectedNeedsYou, setSelectedNeedsYou] = useState<NeedsYouItem | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  // Track connection status
  useEffect(() => {
    const timer = setTimeout(() => {
      setConnectionStatus("connected");
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Refresh data periodically
  const handleRefresh = async () => {
    setRefreshing(true);
    window.location.reload();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      window.location.reload();
    }, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header row: title left, New Project right */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Overview</h2>
          <p className="text-sm text-zinc-500 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${connectionStatus === "connected" ? "bg-green-500" : connectionStatus === "connecting" ? "bg-amber-500" : "bg-red-500"}`}></span>
            {connectionStatus === "connected" ? "Live" : connectionStatus === "connecting" ? "Connecting..." : "Offline"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {refreshing ? "..." : "↻ Refresh"}
          </button>
          <button
            onClick={() => setShowCreateProject(true)}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            New Project
          </button>
        </div>
      </div>

      <CreateProjectModal open={showCreateProject} onOpenChange={setShowCreateProject} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* Needs You */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Needs You ({needsYou.length})</SectionTitle>
            </div>
            {needsYou.length === 0 ? (
              <p className="text-sm text-zinc-500">No pending approvals or blocked items.</p>
            ) : (
              <div className="space-y-3">
                {needsYou.slice(0, 5).map((item) => (
                  <Card
                    key={item.id}
                    className="cursor-pointer border-zinc-200"
                    onClick={() => setSelectedNeedsYou(item)}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900">{item.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                              {item.type}
                            </span>
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

          {/* Active Projects */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Active Projects ({projectCards.length})</SectionTitle>
            </div>
            {projectCards.length === 0 ? (
              <p className="text-sm text-zinc-500">No active projects.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {projectCards.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* Usage */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Usage (24h)</SectionTitle>
            </div>
            <UsageCard usage={{ totalTokens: usage24h.totalTokens, totalCost: usage24h.totalCost, topModels: usage24h.topModels }} />
          </section>

          {/* Teams */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Teams ({teams.length})</SectionTitle>
              <Link href="/teams" className="text-xs text-red-600 hover:underline">
                View all
              </Link>
            </div>
            {teams.length === 0 ? (
              <p className="text-sm text-zinc-500">No teams yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {teams.slice(0, 5).map((team) => {
                  const teamAgents = agents.filter((a) => a.primary_team_id === team.id);
                  const onlineCount = teamAgents.filter((a) => a.status === "active").length;
                  const teamProjects = Array.from(projectsById.values()).filter((p: any) => p.team_id === team.id);
                  const teamApprovals = pendingApprovals.filter((a) => {
                    if (!a.project_id) return false;
                    const proj = projectsById.get(a.project_id);
                    return proj?.team_id === team.id;
                  });

                  // Determine team status based on activity
                  const hasActiveAgents = teamAgents.some((a) => a.status === "active");
                  const hasIdleAgents = teamAgents.some((a) => a.status === "idle");
                  const teamStatus = hasActiveAgents ? "active" : hasIdleAgents ? "idle" : "offline";

                  return (
                    <Link key={team.id} href={`/teams/${team.id}`}>
                      <Card className="cursor-pointer border-zinc-200 transition-shadow hover:shadow-md">
                        <CardContent className="flex items-center justify-between py-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <StatusDot status={teamStatus} />
                              <p className="text-sm font-medium text-zinc-900">{team.name}</p>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {drawBadge(`Online ${onlineCount}/${teamAgents.length}`, onlineCount > 0 ? "green" : "red")}
                              {teamProjects && drawBadge(`Projects ${teamProjects.length}`, "blue")}
                              {teamApprovals.length > 0 && drawBadge(`Approvals ${teamApprovals.length}`, "amber")}
                            </div>
                          </div>
                          <span className="text-zinc-400">→</span>
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

      {/* Drawer */}
      {selectedNeedsYou && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          onClick={() => {
            setSelectedNeedsYou(null);
          }}
        >
          <div className="w-full max-w-md bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Details</h3>
              <button
                onClick={() => {
                  setSelectedNeedsYou(null);
                }}
                className="rounded p-1 hover:bg-zinc-100"
              >
                ✕
              </button>
            </div>
            <pre className="mt-4 max-h-full overflow-auto rounded border bg-zinc-50 p-3 text-xs text-zinc-700">
              {JSON.stringify(selectedNeedsYou, null, 2)}
            </pre>
            <div className="mt-4 flex items-center gap-2">
              <Link
                href="/approvals"
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-red-700"
              >
                Go to Approvals
              </Link>
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
    <Link
      href={`/projects/${project.id}`}
      className="block focus:outline-none focus:ring-2 focus:ring-red-200 rounded-2xl"
    >
      <Card className="border-zinc-200 transition-shadow hover:shadow-md cursor-pointer">
        <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm font-medium">{project.name}</CardTitle>
            <CardDescription className="mt-0.5">
              {project.type && <span className="text-[10px] uppercase">{project.type}</span>}
              {project.teamName && <span> • {project.teamName}</span>}
            </CardDescription>
          </div>
          {project.activeSprint && (
            <span className="text-[10px] text-zinc-500">{project.activeSprint.name}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="h-2 w-full rounded bg-zinc-200">
          <div
            className="h-2 rounded bg-red-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{progress}% complete</span>
          <span>{project.activeSprint ? `${project.activeSprint.progress}%` : "no sprint"}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {(project.approvalCount ?? 0) > 0 && drawBadge(`${project.approvalCount} approvals`, "red")}
          {(project.blockedCount ?? 0) > 0 && drawBadge(`${project.blockedCount} blocked`, "amber")}
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
            {usage.topModels.map((m) => (
              <div key={`${m.provider}:${m.model}`} className="flex items-center justify-between text-sm">
                <span className="text-zinc-900">{m.model}</span>
                <span className="text-zinc-500">{m.tokens.toLocaleString()}</span>
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


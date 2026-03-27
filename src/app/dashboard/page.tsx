import { createServerClient } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";
import { DbBanner } from "@/components/db-banner";
import { buildProjectTruthIndex } from "@/lib/project-summary-truth";
import { OverviewClient } from "./client";

export const dynamic = "force-dynamic";

export type DashboardData = {
  needsYou: NeedsYouItem[];
  projects: ProjectSummary[];
  agents: AgentSummary[];
  events: EventItem[];
  usage: UsageSummary | null;
  teams?: { id: string; name: string }[];
  error: string | null;
};

export type NeedsYouItem = {
  id: string;
  type: "approval" | "blocked" | "error";
  title: string;
  severity?: string;
  projectId?: string;
  projectName?: string;
  agentId?: string;
  agentName?: string;
  jobId?: string;
  createdAt: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  type?: string;
  teamName?: string;
  progress_pct?: number;
  activeSprint?: {
    id: string;
    name: string;
    goal?: string;
    progress: number; // 0-100
    doneCount: number;
    totalCount: number;
  } | null;
  approvalCount: number;
  blockedCount: number;
  lastUpdate?: string;
};

export type AgentSummary = {
  id: string;
  name: string;
  status: string;
  lastSeen?: string;
  currentJob?: string;
};

export type EventItem = {
  id: string;
  type: string;
  label: string;
  severity: "info" | "warn" | "error";
  actorName?: string;
  projectName?: string;
  timestamp: string;
};

export type UsageSummary = {
  totalTokens24h: number;
  totalCost24h: number;
  topModels: { model: string; tokens: number; cost: number }[];
};

async function loadDashboardData(): Promise<DashboardData> {
  const db = createServerClient();
  if (!db) {
    return { needsYou: [], projects: [], agents: [], events: [], usage: null, error: "DB not configured" };
  }

  try {
    // Fetch needs-you items (pending approvals + blocked sprint items + blocked jobs)
    const [approvalsRes, blockedItemsRes, blockedJobsRes] = await Promise.allSettled([
      db.from("approvals").select("id, summary, severity, project_id, agent_id, job_id, created_at").eq("status", "pending").order("created_at", { ascending: false }),
      db.from("sprint_items").select("id, title, project_id, assignee_agent_id, created_at").eq("status", "blocked"),
      db.from("jobs").select("id, title, project_id, owner_agent_id, status, created_at").eq("status", "blocked"),
    ]);

    const approvals = approvalsRes.status === "fulfilled" ? approvalsRes.value.data ?? [] : [];
    const blockedItems = blockedItemsRes.status === "fulfilled" ? blockedItemsRes.value.data ?? [] : [];
    const blockedJobs = blockedJobsRes.status === "fulfilled" ? blockedJobsRes.value.data ?? [] : [];

    // Fetch projects with their active sprint + sprint items for progress
    const projectsRes = await db.from("projects").select("id, name, type, team_id, progress_pct, intake, links, github_repo_binding").eq("status", "active");
    const teamsRes = await db.from("teams").select("id, name");
    const sprintsRes = await db.from("sprints").select("id, project_id, name, goal, status, auto_generated").eq("status", "active");
    const sprintItemsRes = await db.from("sprint_items").select("id, project_id, sprint_id, status, review_status");
    const agentsRes = await db
      .from("agents")
      .select("id, name, status, last_seen, current_job_id")
      .not("name", "like", "_archived_%");
    const eventsRes = await db.from("agent_events").select("id, event_type, payload, agent_id, project_id, job_id, timestamp").order("timestamp", { ascending: false }).limit(10);

    // Usage last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const usageRes = await db.from("ai_usage").select("model, tokens_in, tokens_out, total_tokens, cost_usd, created_at").gte("created_at", oneDayAgo);

    // Map names for readable operator context
    const teamsById = new Map<string, string>();
    (teamsRes.data ?? []).forEach((t) => teamsById.set(t.id, t.name));

    const projectsById = new Map<string, string>();
    (projectsRes.data ?? []).forEach((p) => projectsById.set(p.id, p.name));

    const agentsById = new Map<string, string>();
    (agentsRes.data ?? []).forEach((a) => agentsById.set(a.id, a.name));

    // Map sprints to projects and calculate progress
    const sprintsByProjectId = new Map<string, typeof sprintsRes.data>();
    (sprintsRes.data ?? []).forEach((s) => {
      const arr = sprintsByProjectId.get(s.project_id) ?? [];
      arr.push(s);
      sprintsByProjectId.set(s.project_id, arr);
    });

    const itemsBySprintId = new Map<string, typeof sprintItemsRes.data>();
    (sprintItemsRes.data ?? []).forEach((si) => {
      if (!si.sprint_id) return;
      const arr = itemsBySprintId.get(si.sprint_id) ?? [];
      arr.push(si);
      itemsBySprintId.set(si.sprint_id, arr);
    });

    const projectTruthById = buildProjectTruthIndex({
      projects: (projectsRes.data ?? []) as any[],
      tasks: (sprintItemsRes.data ?? []) as any[],
      sprints: (sprintsRes.data ?? []) as any[],
      jobs: (blockedJobs as any[]) ?? [],
    });

    const projects: ProjectSummary[] = (projectsRes.data ?? []).map((p) => {
      const teamName = p.team_id ? teamsById.get(p.team_id) : undefined;
      const projectSprints = sprintsByProjectId.get(p.id) ?? [];
      const activeSprint = projectSprints[0];
      let progress = 0, doneCount = 0, totalCount = 0;
      if (activeSprint) {
        const items = itemsBySprintId.get(activeSprint.id) ?? [];
        totalCount = items.length;
        doneCount = items.filter((i) => i.status === "done").length;
        progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
      }
      const projectTruth = projectTruthById.get(p.id);
      // Count approvals and blocked jobs per project
      const approvalCount = approvals.filter((a) => a.project_id === p.id).length;
      const blockedJobCount = blockedJobs.filter((j) => j.project_id === p.id).length;
      const blockedItemCount = blockedItems.filter((item) => item.project_id === p.id).length;
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        teamName,
        progress_pct: projectTruth?.progressPct ?? p.progress_pct ?? 0,
        activeSprint: activeSprint
          ? {
              id: activeSprint.id,
              name: activeSprint.name,
              goal: activeSprint.goal,
              progress,
              doneCount,
              totalCount,
            }
          : null,
        approvalCount,
        blockedCount: blockedJobCount + blockedItemCount,
      };
    });

    // Agents with current job
    const agents: AgentSummary[] = (agentsRes.data ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      lastSeen: a.last_seen,
      currentJob: a.current_job_id,
    }));

    // Needs You items
    const needsYou: NeedsYouItem[] = [
      ...(approvals as any[]).map((a) => ({
        id: a.id,
        type: "approval" as const,
        title: a.summary || "Approval requested",
        severity: a.severity || "medium",
        projectId: a.project_id,
        agentId: a.agent_id,
        jobId: a.job_id,
        createdAt: a.created_at,
      })),
      ...((blockedItems as any[]) ?? []).map((si) => ({
        id: si.id,
        type: "blocked" as const,
        title: si.title || "Blocked sprint item",
        projectId: si.project_id,
        agentId: si.assignee_agent_id,
        createdAt: si.created_at,
      })),
      ...((blockedJobs as any[]) ?? []).map((j) => ({
        id: j.id,
        type: "error" as const,
        title: j.title || "Blocked job",
        projectId: j.project_id,
        agentId: j.owner_agent_id,
        createdAt: j.created_at,
      })),
    ];

    const events: EventItem[] = (eventsRes.data ?? []).map((e: any) => ({
      id: e.id,
      type: e.event_type,
      label: e.event_type.replace(/_/g, " "),
      severity:
        e.event_type?.includes("blocked") || e.event_type === "approval_decided"
          ? ("warn" as const)
          : ("info" as const),
      timestamp: e.timestamp,
      actorName: e.agent_id ? agentsById.get(e.agent_id) : undefined,
      projectName: e.project_id ? projectsById.get(e.project_id) : undefined,
    }));

    // Usage aggregations
    const usageRows = usageRes.data ?? [];
    const totalTokens24h = (usageRows as any[]).reduce((sum, r) => sum + (r.total_tokens || 0), 0);
    const totalCost24h = (usageRows as any[]).reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
    const byModel = new Map<string, { model: string; tokens: number; cost: number }>();
    (usageRows as any[]).forEach((r) => {
      const m = r.model ?? "unknown";
      const existing = byModel.get(m) ?? { model: m, tokens: 0, cost: 0 };
      existing.tokens += r.total_tokens || 0;
      existing.cost += Number(r.cost_usd) || 0;
      byModel.set(m, existing);
    });
    const topModels = Array.from(byModel.values()).sort((a, b) => b.tokens - a.tokens).slice(0, 3);

    const usage: UsageSummary = { totalTokens24h, totalCost24h, topModels };

    return { needsYou, projects, agents, events, usage, teams: (teamsRes.data ?? []) as any, error: null };
  } catch (err: any) {
    return {
      needsYou: [],
      projects: [],
      agents: [],
      events: [],
      usage: null,
      error: err?.message ?? "Unknown error loading data",
    };
  }
}

export default async function DashboardPage() {
  const data = await loadDashboardData();

  return (
    <div className="space-y-6">
      <DbBanner />

      {data.error && (
        <ErrorState
          title="Error loading data"
          message={data.error}
          details="Check that the migrations have been applied in Supabase SQL Editor."
        />
      )}

      <OverviewClient initialData={data} />
    </div>
  );
}

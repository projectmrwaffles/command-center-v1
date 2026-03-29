import { create } from "zustand";
import { supabaseRealtime } from "./supabase-realtime";

// Types
export interface Agent {
  id: string;
  name: string;
  title?: string;
  primary_team_id?: string;
  type: string;
  status: "active" | "idle" | "offline" | "error";
  last_seen?: string;
  current_job_id?: string;
}

export interface Project {
  id: string;
  name: string;
  type?: string;
  team_id?: string;
  progress_pct: number;
  updated_at?: string;
  status?: string;
  teamName?: string;
}

export interface Sprint {
  id: string;
  project_id: string;
  name: string;
  status: "draft" | "active" | "completed" | "cancelled";
  progress_pct: number;
}

export interface Job {
  id: string;
  project_id?: string;
  title: string;
  status: string;
  owner_agent_id?: string;
}

export interface Approval {
  id: string;
  status: "pending" | "approved" | "changes_requested";
  summary?: string;
  severity?: string;
  project_id?: string;
  agent_id?: string;
  job_id?: string;
  created_at: string;
}

export interface EventItem {
  id: string;
  event_type: string;
  payload: any;
  agent_id?: string;
  project_id?: string;
  job_id?: string;
  timestamp: string;
}

export interface UsageRollup {
  bucket_minute: string;
  provider: string;
  model: string;
  agent_id?: string;
  project_id?: string;
  tokens: number;
  cost_usd: number;
  calls: number;
}

export function isArchivedAgent(agent: Pick<Agent, "name"> | null | undefined) {
  return Boolean(agent?.name?.includes("archived_"));
}

// State
interface RealtimeState {
  agentsById: Map<string, Agent>;
  projectsById: Map<string, Project>;
  sprintsById: Map<string, Sprint>;
  jobsById: Map<string, Job>;
  approvalsById: Map<string, Approval>;
  teamsById: Map<string, { id: string; name: string }>;
  events: EventItem[];
  usageRollup: Map<string, UsageRollup>; // key: "bucket|provider|model|agent|project"

  // Actions
  upsertAgent: (a: Agent) => void;
  replaceAgents: (agents: Agent[]) => void;
  removeAgent: (id: string) => void;
  upsertProject: (p: Project) => void;
  upsertSprint: (s: Sprint) => void;
  upsertJob: (j: Job) => void;
  upsertApproval: (a: Approval) => void;
  upsertTeam: (t: { id: string; name: string }) => void;
  prependEvent: (e: EventItem) => void;
  upsertUsageRollup: (u: UsageRollup) => void;
  pruneEvents: (maxCount: number) => void;
  removeApproval: (id: string) => void;
}

function makeRollupKey(u: UsageRollup) {
  return `${u.bucket_minute}|${u.provider}|${u.model}|${u.agent_id ?? ""}|${u.project_id ?? ""}`;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  agentsById: new Map(),
  projectsById: new Map(),
  sprintsById: new Map(),
  jobsById: new Map(),
  approvalsById: new Map(),
  teamsById: new Map(),
  events: [],
  usageRollup: new Map(),

  upsertAgent: (a) =>
    set((state) => {
      const next = new Map(state.agentsById);
      if (isArchivedAgent(a)) {
        next.delete(a.id);
      } else {
        next.set(a.id, a);
      }
      return { agentsById: next };
    }),

  replaceAgents: (agents) =>
    set(() => ({
      agentsById: new Map(
        agents
          .filter((agent) => !isArchivedAgent(agent))
          .map((agent) => [agent.id, agent]),
      ),
    })),

  removeAgent: (id) =>
    set((state) => {
      const next = new Map(state.agentsById);
      next.delete(id);
      return { agentsById: next };
    }),

  upsertProject: (p) =>
    set((state) => {
      const next = new Map(state.projectsById);
      next.set(p.id, p);
      return { projectsById: next };
    }),

  upsertSprint: (s) =>
    set((state) => {
      const next = new Map(state.sprintsById);
      next.set(s.id, s);
      return { sprintsById: next };
    }),

  upsertJob: (j) =>
    set((state) => {
      const next = new Map(state.jobsById);
      next.set(j.id, j);
      return { jobsById: next };
    }),

  upsertApproval: (a) =>
    set((state) => {
      const next = new Map(state.approvalsById);
      next.set(a.id, a);
      return { approvalsById: next };
    }),

  removeApproval: (id) =>
    set((state) => {
      const next = new Map(state.approvalsById);
      next.delete(id);
      return { approvalsById: next };
    }),

  upsertTeam: (t) =>
    set((state) => {
      const next = new Map(state.teamsById);
      next.set(t.id, t);
      return { teamsById: next };
    }),

  prependEvent: (e) =>
    set((state) => {
      const next = [e, ...state.events];
      if (next.length > 200) next.pop();
      return { events: next };
    }),

  upsertUsageRollup: (u) =>
    set((state) => {
      const next = new Map(state.usageRollup);
      const key = makeRollupKey(u);
      next.set(key, u);
      return { usageRollup: next };
    }),

  pruneEvents: (maxCount) =>
    set((state) => ({
      events: state.events.slice(0, maxCount),
    })),
}));

// Selectors (derived, no heavy compute)
export function selectAgentsList(state: RealtimeState) {
  return Array.from(state.agentsById.values()).filter((agent) => !isArchivedAgent(agent));
}

export function selectProjectsList(state: RealtimeState) {
  return Array.from(state.projectsById.values());
}

export function selectPendingApprovals(state: RealtimeState): Approval[] {
  return Array.from(state.approvalsById.values()).filter(
    (a) => a.status === "pending"
  );
}

export function selectActiveProjectsWithProgress(state: RealtimeState) {
  return selectProjectsList(state).map((p) => {
    // Find active sprint
    const sprints = Array.from(state.sprintsById.values()).filter(
      (s) => s.project_id === p.id && s.status === "active"
    );
    const active = sprints[0];
    return {
      ...p,
      activeSprint: active
        ? {
            id: active.id,
            name: active.name,
            progress: active.progress_pct,
          }
        : null,
    };
  });
}

// 24h rolling window from usage_rollup_minute (client-side)
export function selectUsage24h(state: RealtimeState) {
  const now = Date.now();
  const cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  
  const rows = Array.from(state.usageRollup.values()).filter(
    (u) => u.bucket_minute >= cutoff
  );

  const totalTokens = rows.reduce((s, r) => s + (r.tokens || 0), 0);
  const totalCost = rows.reduce((s, r) => s + (r.cost_usd || 0), 0);

  // Top models aggregated
  const byModel = new Map<
    string,
    { model: string; provider: string; tokens: number; cost: number }
  >();
  
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
}

// Realtime subscriptions hook
export function useRealtimeSubscriptions() {
  const store = useRealtimeStore();

  useEffect(() => {
    const realtime = supabaseRealtime;
    if (!realtime) return;

    console.log("[Realtime] Subscribing to all tables...");
    const channels: any[] = [];

    const add = (table: string, cb: (payload: any) => void) => {
      const ch = realtime
        .channel(`public:${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          (payload) => cb(payload)
        )
        .subscribe();
      channels.push(ch);
    };

    // Agents
    add("agents", (p) => {
      if (p.eventType === "DELETE") return; // handled elsewhere
      store.upsertAgent(p.new);
    });

    // Projects
    add("projects", (p) => {
      store.upsertProject(p.new);
    });

    // Sprints
    add("sprints", (p) => {
      store.upsertSprint(p.new);
    });

    // Jobs
    add("jobs", (p) => {
      store.upsertJob(p.new);
    });

    // Approvals
    add("approvals", (p) => {
      if (p.eventType === "DELETE") {
        store.removeApproval(p.old.id);
      } else {
        store.upsertApproval(p.new);
      }
    });

    // Agent events
    add("agent_events", (p) => {
      if (p.eventType === "INSERT") {
        store.prependEvent(p.new);
      }
    });

    // Usage rollup
    add("usage_rollup_minute", (p) => {
      if (p.eventType === "INSERT" || p.eventType === "UPDATE") {
        store.upsertUsageRollup(p.new);
      }
    });

    return () => {
      console.log("[Realtime] Unsubscribing...");
      channels.forEach((c) => c.unsubscribe());
    };
  }, [store]);
}

import { useEffect } from "react";

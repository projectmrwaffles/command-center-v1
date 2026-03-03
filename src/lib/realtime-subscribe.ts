// Lightweight subscription helpers for realtime tables
// Each returns { unsubscribe } to avoid duplicate/lingering subscriptions

import { supabaseRealtime } from "./supabase-realtime";

type TableName =
  | "agents"
  | "agent_events"
  | "approvals"
  | "projects"
  | "sprints"
  | "jobs"
  | "usage_rollup_minute"
  | "teams";

interface Subscription {
  unsubscribe: () => void;
}

function subscribe(table: TableName, onEvent: (payload: any) => void): Subscription {
  const channel = supabaseRealtime
    .channel(`public:${table}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => {
        const id = (payload.new && (payload.new as any).id) || (payload.old && (payload.old as any).id);
        console.log(`[Realtime] ${table}:`, payload.eventType, id);
        onEvent(payload);
      }
    )
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log(`[Realtime] Subscribed to ${table}`);
      }
      if (err) {
        console.error(`[Realtime] Error on ${table}:`, err);
      }
    });

  return {
    unsubscribe: () => {
      channel.unsubscribe();
      console.log(`[Realtime] Unsubscribed from ${table}`);
    },
  };
}

// Single entry point to subscribe to all required tables
export function subscribeToAllTables(handlers: {
  onAgent?: (p: any) => void;
  onAgentEvent?: (p: any) => void;
  onApproval?: (p: any) => void;
  onProject?: (p: any) => void;
  onSprint?: (p: any) => void;
  onJob?: (p: any) => void;
  onUsageRollup?: (p: any) => void;
  onTeam?: (p: any) => void;
}): { unsubscribeAll: () => void } {
  const subs: Subscription[] = [];

  if (handlers.onAgent) subs.push(subscribe("agents", handlers.onAgent));
  if (handlers.onAgentEvent) subs.push(subscribe("agent_events", handlers.onAgentEvent));
  if (handlers.onApproval) subs.push(subscribe("approvals", handlers.onApproval));
  if (handlers.onProject) subs.push(subscribe("projects", handlers.onProject));
  if (handlers.onSprint) subs.push(subscribe("sprints", handlers.onSprint));
  if (handlers.onJob) subs.push(subscribe("jobs", handlers.onJob));
  if (handlers.onUsageRollup) subs.push(subscribe("usage_rollup_minute", handlers.onUsageRollup));
  if (handlers.onTeam) subs.push(subscribe("teams", handlers.onTeam));

  return {
    unsubscribeAll: () => subs.forEach((s) => s.unsubscribe()),
  };
}

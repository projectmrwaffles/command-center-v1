// Supabase Realtime client setup for instant UI updates
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser-side realtime client (uses anon key)
export const supabaseRealtime = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Type-safe channel subscriptions
export type RealtimeTable =
  | "agents"
  | "agent_events"
  | "ai_usage_events"
  | "ai_usage"
  | "approvals"
  | "jobs"
  | "projects"
  | "sprints"
  | "sprint_items"
  | "usage_rollup_minute";

export type EventType = "INSERT" | "UPDATE" | "DELETE" | "*";

interface SubscriptionConfig {
  table: RealtimeTable;
  event?: EventType;
  filter?: string;
  onEvent: (payload: any) => void;
  onError?: (error: any) => void;
}

export function subscribeToTable({
  table,
  event = "*",
  filter,
  onEvent,
  onError,
}: SubscriptionConfig) {
  const channelName = filter ? `${table}:${filter}` : table;

  const channel = supabaseRealtime
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event,
        schema: "public",
        table,
        filter,
      },
      (payload) => {
        console.log(`[Realtime] ${table}:${event}`, payload);
        onEvent(payload);
      }
    )
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log(`[Realtime] Subscribed to ${table}`);
      }
      if (err && onError) {
        console.error(`[Realtime] Error on ${table}:`, err);
        onError(err);
      }
    });

  return {
    unsubscribe: () => {
      channel.unsubscribe();
      console.log(`[Realtime] Unsubscribed from ${table}`);
    },
  };
}

// Multi-table subscription helper
export function subscribeToTables(
  configs: SubscriptionConfig[]
) {
  const subs = configs.map(subscribeToTable);
  return {
    unsubscribeAll: () => {
      subs.forEach((s) => s.unsubscribe());
    },
  };
}

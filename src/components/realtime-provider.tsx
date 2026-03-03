"use client";

import { useEffect, useRef } from "react";
import { useRealtimeStore } from "@/lib/realtime-store";
import { subscribeToAllTables } from "@/lib/realtime-subscribe";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

/**
 * Subscribes once per app session and seeds the shared realtime store.
 * Avoids duplicate subscriptions across pages.
 */
export function RealtimeProvider() {
  const store = useRealtimeStore();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let unsub: { unsubscribeAll: () => void } | null = null;

    (async () => {
      try {
        // Seed from lightweight API routes (service-role server-side).
        const [agents, projects, sprints, jobs, approvals, teams, usageRollup] = await Promise.all([
          fetchJson("/api/realtime/agents"),
          fetchJson("/api/realtime/projects"),
          fetchJson("/api/realtime/sprints"),
          fetchJson("/api/realtime/jobs"),
          fetchJson("/api/realtime/approvals"),
          fetchJson("/api/realtime/teams"),
          fetchJson("/api/realtime/usage-rollup"),
        ]);

        (agents?.agents ?? []).forEach((a: any) => store.upsertAgent(a));
        (projects?.projects ?? []).forEach((p: any) => store.upsertProject(p));
        (sprints?.sprints ?? []).forEach((s: any) => store.upsertSprint(s));
        (jobs?.jobs ?? []).forEach((j: any) => store.upsertJob(j));
        (approvals?.approvals ?? []).forEach((a: any) => store.upsertApproval(a));
        (teams?.teams ?? []).forEach((t: any) => store.upsertTeam(t));
        (usageRollup?.usageRollup ?? []).forEach((u: any) => store.upsertUsageRollup(u));
      } catch (e) {
        // Non-fatal: realtime still works even if seed fails.
        console.warn("[RealtimeProvider] seed failed", e);
      }

      unsub = subscribeToAllTables({
        onAgent: (p) => {
          if (p.eventType !== "DELETE") store.upsertAgent(p.new);
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
        onApproval: (p) => {
          if (p.eventType === "DELETE") store.removeApproval(p.old.id);
          else store.upsertApproval(p.new);
        },
        onAgentEvent: (p) => {
          if (p.eventType === "INSERT") {
            // Skip heartbeat noise by default
            if (p.new?.event_type === "HEARTBEAT") return;
            store.prependEvent(p.new);
          }
        },
        onUsageRollup: (p) => {
          if (p.eventType !== "DELETE") store.upsertUsageRollup(p.new);
        },
        onTeam: (p) => {
          if (p.eventType !== "DELETE") store.upsertTeam(p.new);
        },
      });
    })();

    return () => {
      unsub?.unsubscribeAll();
    };
  }, [store]);

  return null;
}

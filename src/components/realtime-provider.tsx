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
  const upsertAgent = useRealtimeStore((s) => s.upsertAgent);
  const upsertProject = useRealtimeStore((s) => s.upsertProject);
  const upsertSprint = useRealtimeStore((s) => s.upsertSprint);
  const upsertJob = useRealtimeStore((s) => s.upsertJob);
  const upsertApproval = useRealtimeStore((s) => s.upsertApproval);
  const removeApproval = useRealtimeStore((s) => s.removeApproval);
  const upsertTeam = useRealtimeStore((s) => s.upsertTeam);
  const prependEvent = useRealtimeStore((s) => s.prependEvent);
  const upsertUsageRollup = useRealtimeStore((s) => s.upsertUsageRollup);
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

        (agents?.agents ?? []).forEach((a: any) => upsertAgent(a));
        (projects?.projects ?? []).forEach((p: any) => upsertProject(p));
        (sprints?.sprints ?? []).forEach((s: any) => upsertSprint(s));
        (jobs?.jobs ?? []).forEach((j: any) => upsertJob(j));
        (approvals?.approvals ?? []).forEach((a: any) => upsertApproval(a));
        (teams?.teams ?? []).forEach((t: any) => upsertTeam(t));
        (usageRollup?.usageRollup ?? []).forEach((u: any) => upsertUsageRollup(u));
      } catch (e) {
        // Non-fatal: realtime still works even if seed fails.
        console.warn("[RealtimeProvider] seed failed", e);
      }

      unsub = subscribeToAllTables({
        onAgent: (p) => {
          if (p.eventType !== "DELETE") upsertAgent(p.new);
        },
        onProject: (p) => {
          if (p.eventType !== "DELETE") upsertProject(p.new);
        },
        onSprint: (p) => {
          if (p.eventType !== "DELETE") upsertSprint(p.new);
        },
        onJob: (p) => {
          if (p.eventType !== "DELETE") upsertJob(p.new);
        },
        onApproval: (p) => {
          if (p.eventType === "DELETE") removeApproval(p.old.id);
          else upsertApproval(p.new);
        },
        onAgentEvent: (p) => {
          if (p.eventType === "INSERT") {
            // Skip heartbeat noise by default
            if (p.new?.event_type === "HEARTBEAT") return;
            prependEvent(p.new);
          }
        },
        onUsageRollup: (p) => {
          if (p.eventType !== "DELETE") upsertUsageRollup(p.new);
        },
        onTeam: (p) => {
          if (p.eventType !== "DELETE") upsertTeam(p.new);
        },
      });
    })();

    return () => {
      unsub?.unsubscribeAll();
    };
  }, [prependEvent, removeApproval, upsertAgent, upsertApproval, upsertJob, upsertProject, upsertSprint, upsertTeam, upsertUsageRollup]);

  return null;
}

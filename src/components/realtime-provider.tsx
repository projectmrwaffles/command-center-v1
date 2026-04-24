"use client";

import { useEffect, useRef } from "react";
import { useRealtimeStore } from "@/lib/realtime-store";
import { subscribeToAllTables } from "@/lib/realtime-subscribe";

/**
 * Subscribes once per app session to live updates.
 * Initial data is hydrated by route-local loaders so startup does not fan out
 * across multiple dynamic seed endpoints on every page load.
 */
export function RealtimeProvider() {
  const upsertAgent = useRealtimeStore((s) => s.upsertAgent);
  const removeAgent = useRealtimeStore((s) => s.removeAgent);
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

    unsub = subscribeToAllTables({
      onAgent: (p) => {
        if (p.eventType === "DELETE") removeAgent(p.old.id);
        else upsertAgent(p.new);
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

    return () => {
      unsub?.unsubscribeAll();
    };
  }, [prependEvent, removeAgent, removeApproval, upsertAgent, upsertApproval, upsertJob, upsertProject, upsertSprint, upsertTeam, upsertUsageRollup]);

  return null;
}

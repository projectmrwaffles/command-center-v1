export type ProjectDetailRecentSignalTruthInput = {
  id: string;
  kind: "blocked" | "approval" | "completed" | "progress" | "activity";
  title: string;
  detail: string;
  timestamp: string;
  actorName?: string | null;
};

export type ProjectDetailEventTruthInput = {
  id: string;
  event_type: string;
  payload?: Record<string, unknown> | null;
  timestamp?: string | null;
  created_at?: string | null;
  agents?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

export type ResolvedProjectDetailRecentUpdate = {
  id: string;
  kind: "blocked" | "approval" | "completed" | "progress" | "activity";
  title: string;
  detail: string;
  timestamp: string;
  actorName: string | null;
  sourceLabel: string;
  sourceDetail: string | null;
};

function startCase(value?: string | null) {
  if (!value) return "Unknown";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getActorName(event: ProjectDetailEventTruthInput) {
  if (Array.isArray(event.agents)) return event.agents[0]?.name || null;
  return event.agents?.name || null;
}

function resolveEventKind(event: ProjectDetailEventTruthInput): ResolvedProjectDetailRecentUpdate["kind"] {
  const payload = event.payload || {};
  const status = typeof payload.status === "string" ? payload.status : null;
  if (status === "failed" || status === "blocked" || /blocked/i.test(event.event_type)) return "blocked";
  if (status === "completed" || /completed/i.test(event.event_type)) return "completed";
  if (/review|approval/i.test(event.event_type)) return "approval";
  if (/progress|dispatch|attempt|step|status_changed/i.test(event.event_type)) return "progress";
  return "activity";
}

export function resolveProjectDetailRecentUpdates(input: {
  recentSignals?: ProjectDetailRecentSignalTruthInput[];
  events?: ProjectDetailEventTruthInput[];
}): ResolvedProjectDetailRecentUpdate[] {
  const recentSignals = input.recentSignals || [];
  if (recentSignals.length > 0) {
    return recentSignals.map((signal) => ({
      id: signal.id,
      kind: signal.kind,
      title: signal.title,
      detail: signal.detail,
      timestamp: signal.timestamp,
      actorName: signal.actorName || null,
      sourceLabel: "Project activity",
      sourceDetail: null,
    }));
  }

  const events = input.events || [];
  const fallbackUpdates = events
    .map((event): ResolvedProjectDetailRecentUpdate | null => {
      const payload = event.payload || {};
      const status = typeof payload.status === "string" ? payload.status : null;
      const title = typeof payload.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : typeof payload.summary === "string" && payload.summary.trim()
          ? payload.summary.trim()
          : `${startCase(event.event_type)} event`;
      const detail = [
        typeof payload.detail === "string" ? payload.detail : null,
        typeof payload.message === "string" ? payload.message : null,
        typeof payload.step_name === "string" ? `Step: ${payload.step_name}` : null,
        status ? `Status: ${startCase(status)}` : null,
      ].filter(Boolean).join(" • ") || "This update is being shown from the project detail resolver fallback event stream.";
      const timestamp = event.timestamp || event.created_at;
      if (!timestamp) return null;
      return {
        id: `event-${event.id}`,
        kind: resolveEventKind(event),
        title,
        detail,
        timestamp,
        actorName: getActorName(event),
        sourceLabel: "Resolver fallback",
        sourceDetail: "No page-local recent signals were available, so this feed is following the shared project-detail event fallback.",
      } satisfies ResolvedProjectDetailRecentUpdate;
    })
    .filter((item): item is ResolvedProjectDetailRecentUpdate => item !== null);

  return fallbackUpdates
    .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
    .slice(0, 12);
}

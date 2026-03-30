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

const NOISY_EVENT_PATTERNS = [
  /webhook/i,
  /heartbeat/i,
  /checkpoint/i,
  /attempt/i,
  /step/i,
  /status_changed/i,
];

function startCase(value?: string | null) {
  if (!value) return "Unknown";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanText(value?: string | null) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
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
  if (/dispatch|progress/i.test(event.event_type)) return "progress";
  return "activity";
}

function isLowSignalEvent(event: ProjectDetailEventTruthInput) {
  const payload = event.payload || {};
  const title = typeof payload.title === "string" ? payload.title : "";
  const message = typeof payload.message === "string" ? payload.message : "";
  const detail = typeof payload.detail === "string" ? payload.detail : "";
  const haystack = `${event.event_type} ${title} ${message} ${detail}`;
  return NOISY_EVENT_PATTERNS.some((pattern) => pattern.test(haystack));
}

function normalizeDetail(parts: Array<string | null | undefined>) {
  return cleanText(parts.filter(Boolean).join(" • "));
}

function dedupeUpdates(updates: ResolvedProjectDetailRecentUpdate[]) {
  const seen = new Set<string>();
  return updates.filter((update) => {
    const key = [
      update.kind,
      cleanText(update.title).toLowerCase(),
      cleanText(update.detail).toLowerCase(),
      update.actorName?.toLowerCase() || "",
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveProjectDetailRecentUpdates(input: {
  recentSignals?: ProjectDetailRecentSignalTruthInput[];
  events?: ProjectDetailEventTruthInput[];
}): ResolvedProjectDetailRecentUpdate[] {
  const recentSignals = (input.recentSignals || [])
    .map((signal) => ({
      id: signal.id,
      kind: signal.kind,
      title: cleanText(signal.title),
      detail: cleanText(signal.detail),
      timestamp: signal.timestamp,
      actorName: signal.actorName || null,
      sourceLabel: "Project activity",
      sourceDetail: null,
    }))
    .filter((signal) => signal.title && signal.timestamp)
    .filter((signal) => !(signal.kind === "progress" && /queued job|agent pickup/i.test(signal.title + " " + signal.detail)));

  if (recentSignals.length > 0) {
    return dedupeUpdates(recentSignals)
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
      .slice(0, 8);
  }

  const events = input.events || [];
  const fallbackUpdates = events
    .filter((event) => !isLowSignalEvent(event))
    .map((event): ResolvedProjectDetailRecentUpdate | null => {
      const payload = event.payload || {};
      const status = typeof payload.status === "string" ? payload.status : null;
      const title = cleanText(
        typeof payload.title === "string" && payload.title.trim()
          ? payload.title
          : typeof payload.summary === "string" && payload.summary.trim()
            ? payload.summary
            : startCase(event.event_type),
      );
      const detail = normalizeDetail([
        typeof payload.detail === "string" ? payload.detail : null,
        typeof payload.message === "string" ? payload.message : null,
        typeof payload.step_name === "string" && !/step/i.test(event.event_type) ? `Step: ${payload.step_name}` : null,
        status && !/completed|queued|running/i.test(status) ? `Status: ${startCase(status)}` : null,
      ]) || "Recent project activity";
      const timestamp = event.timestamp || event.created_at;
      if (!timestamp || !title) return null;
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

  return dedupeUpdates(fallbackUpdates)
    .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
    .slice(0, 8);
}

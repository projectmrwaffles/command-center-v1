export type ProjectDetailRecentUpdateKind = "blocked" | "approval" | "review" | "completed" | "progress" | "activity";

export type ProjectDetailRecentSignalTruthInput = {
  id: string;
  kind: ProjectDetailRecentUpdateKind;
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
  kind: ProjectDetailRecentUpdateKind;
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

const LOW_SIGNAL_TEXT_PATTERNS = [
  /queued job/i,
  /active job/i,
  /job is currently running/i,
  /dispatched job is queued/i,
  /agent pickup/i,
  /task dispatched/i,
  /^recent project activity$/i,
];

const KIND_PRIORITY: Record<ProjectDetailRecentUpdateKind, number> = {
  blocked: 5,
  approval: 4,
  review: 4,
  completed: 3,
  progress: 2,
  activity: 1,
};

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

function normalizeTopic(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b(task|review|approval|project|stage|milestone|work item|needs|follow|through)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getActorName(event: ProjectDetailEventTruthInput) {
  if (Array.isArray(event.agents)) return event.agents[0]?.name || null;
  return event.agents?.name || null;
}

function resolveEventKind(event: ProjectDetailEventTruthInput): ProjectDetailRecentUpdateKind {
  const payload = event.payload || {};
  const status = typeof payload.status === "string" ? payload.status : null;
  const haystack = `${event.event_type} ${typeof payload.title === "string" ? payload.title : ""} ${typeof payload.summary === "string" ? payload.summary : ""} ${typeof payload.message === "string" ? payload.message : ""}`;
  if (status === "failed" || status === "blocked" || /blocked|risk|hold/i.test(haystack)) return "blocked";
  if (/review|changes_requested|approved|ready_for_review|rereview/i.test(haystack)) return "review";
  if (/approval|approved_to_proceed|rejected/i.test(haystack)) return "approval";
  if (status === "completed" || /completed|shipped|done/i.test(haystack)) return "completed";
  if (/dispatch|progress|started|in_progress/i.test(haystack)) return "progress";
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

function isLowSignalUpdate(update: Pick<ResolvedProjectDetailRecentUpdate, "kind" | "title" | "detail">) {
  const haystack = `${update.title} ${update.detail}`;
  if (update.kind === "progress" || update.kind === "activity") {
    return LOW_SIGNAL_TEXT_PATTERNS.some((pattern) => pattern.test(haystack));
  }
  return false;
}

function normalizeDetail(parts: Array<string | null | undefined>) {
  return cleanText(parts.filter(Boolean).join(" • "));
}

function dedupeUpdates(updates: ResolvedProjectDetailRecentUpdate[]) {
  const seen = new Map<string, ResolvedProjectDetailRecentUpdate>();

  for (const update of updates) {
    const key = [normalizeTopic(update.title), normalizeTopic(update.detail) || update.kind].join("|");
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, update);
      continue;
    }

    const existingPriority = KIND_PRIORITY[existing.kind];
    const nextPriority = KIND_PRIORITY[update.kind];
    if (nextPriority > existingPriority || (nextPriority === existingPriority && +new Date(update.timestamp) > +new Date(existing.timestamp))) {
      seen.set(key, update);
    }
  }

  return Array.from(seen.values());
}

function curateUpdates(updates: ResolvedProjectDetailRecentUpdate[]) {
  return dedupeUpdates(
    updates.filter((update) => update.title && update.timestamp && !isLowSignalUpdate(update)),
  )
    .sort((a, b) => {
      const priorityDelta = KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind];
      if (priorityDelta !== 0) return priorityDelta;
      return +new Date(b.timestamp) - +new Date(a.timestamp);
    })
    .slice(0, 8);
}

export function resolveProjectDetailRecentUpdates(input: {
  recentSignals?: ProjectDetailRecentSignalTruthInput[];
  events?: ProjectDetailEventTruthInput[];
  extraUpdates?: ProjectDetailRecentSignalTruthInput[];
}): ResolvedProjectDetailRecentUpdate[] {
  const directSignals = [...(input.recentSignals || []), ...(input.extraUpdates || [])]
    .map((signal) => ({
      id: signal.id,
      kind: signal.kind,
      title: cleanText(signal.title),
      detail: cleanText(signal.detail),
      timestamp: signal.timestamp,
      actorName: signal.actorName || null,
      sourceLabel: signal.kind === "review" ? "Review state" : "Project activity",
      sourceDetail: null,
    }))
    .filter((signal) => signal.title && signal.timestamp);

  const fallbackUpdates = (input.events || [])
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

  const primaryUpdates = curateUpdates(directSignals);
  if (primaryUpdates.length > 0) return primaryUpdates;
  return curateUpdates(fallbackUpdates);
}

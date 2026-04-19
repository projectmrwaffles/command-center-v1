import Link from "next/link";
import { Activity, ArrowLeft, Bot, Clock3, Sparkles } from "lucide-react";
import { createServerClient, isMockMode } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";
import { DbBanner } from "@/components/db-banner";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { PageHero, PageHeroStat } from "@/components/ui/page-hero";
import {
  formatAgentType,
  formatEventType,
  formatLastSeen,
  getAgentDisplayName,
  getAgentEmoji,
  getAgentStatusLabel,
  statusClasses,
} from "../agent-utils";

export const dynamic = "force-dynamic";

type Agent = { id: string; name: string; type: string; status: string; last_seen: string | null };

type AgentEvent = { id: string; event_type: string; payload: Record<string, unknown>; timestamp: string };

const RECENT_ACTIVITY_WINDOW_DAYS = 7;

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let agent: Agent | null = null;
  let events: AgentEvent[] = [];
  let error: { message: string; details?: string } | null = null;

  const db = createServerClient();
  if (!db) {
    return (
      <div className="space-y-6">
        <DbBanner />
        <ErrorState
          title="DB not initialized"
          message="Supabase env missing or migrations not applied."
          details="Apply migrations in Supabase SQL Editor, then refresh."
        />
      </div>
    );
  }

  try {
    const agentRes = await db
      .from("agents")
      .select("id, name, type, status, last_seen")
      .eq("id", id)
      .single();
    agent = (agentRes.data ?? null) as Agent | null;

    const eventsRes = await db
      .from("agent_events")
      .select("id, event_type, payload, timestamp")
      .eq("agent_id", id)
      .order("timestamp", { ascending: false })
      .limit(50);
    events = (eventsRes.data ?? []) as AgentEvent[];
  } catch (err) {
    error = {
      message: "Failed to load agent details",
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (error) {
    return (
      <div className="space-y-6">
        <DbBanner />
        <ErrorState title="Error loading data" message={error.message} details={error.details} />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="space-y-6">
        <DbBanner />
        <ErrorState title="Agent not found" message="This agent does not exist." />
      </div>
    );
  }

  const mockBanner = isMockMode() ? (
    <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
      <span className="font-medium">Demo mode</span> – backend not connected.
    </div>
  ) : null;

  const nowMs = new Date().getTime();
  const recentCutoffMs = nowMs - RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentEvents = events.filter((event) => new Date(event.timestamp).getTime() >= recentCutoffMs);
  const historicalEvents = events.filter((event) => new Date(event.timestamp).getTime() < recentCutoffMs);

  return (
    <div className="space-y-6">
      <DbBanner />
      {mockBanner}

      <PageHero>
        <div className="flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <Link
              href="/agents"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white/85 px-3 py-1.5 text-sm text-zinc-600 shadow-sm transition hover:border-red-200 hover:text-zinc-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to agents
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-700 shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Agent detail
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-zinc-200 bg-white text-3xl">
                <span aria-hidden="true">{getAgentEmoji(agent.name)}</span>
              </div>
              <div className="space-y-3">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
                    {getAgentDisplayName(agent.name)}
                  </h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600 sm:text-base">
                    {formatAgentType(agent.type)} agent surface with recent execution events and presence metadata.
                  </p>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${statusClasses(agent.status)}`}>
                  {getAgentStatusLabel(agent.status)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[460px]">
            <PageHeroStat className="border-zinc-200 bg-white">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                <Bot className="h-4 w-4 text-red-500" />
                Identity
              </div>
              <div className="mt-3 text-lg font-semibold tracking-tight text-zinc-950">{formatAgentType(agent.type)}</div>
              <p className="mt-1 text-xs text-zinc-500">Stored agent classification.</p>
            </PageHeroStat>
            <PageHeroStat className="border-emerald-100 shadow-[0_8px_24px_rgba(16,185,129,0.08)]">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                <Clock3 className="h-4 w-4 text-emerald-500" />
                Last seen
              </div>
              <div className="mt-3 text-lg font-semibold tracking-tight text-zinc-950">{formatLastSeen(agent.last_seen)}</div>
              <p className="mt-1 text-xs text-zinc-500">Latest heartbeat or reported presence.</p>
            </PageHeroStat>
            <PageHeroStat className="border-zinc-200 bg-white">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                <Activity className="h-4 w-4 text-red-500" />
                Events
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{recentEvents.length}</div>
              <p className="mt-1 text-xs text-zinc-500">Timeline entries from the last {RECENT_ACTIVITY_WINDOW_DAYS} days.</p>
            </PageHeroStat>
          </div>
        </div>
      </PageHero>

      <Card variant="soft" className="rounded-[24px] border-zinc-200 bg-white">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="space-y-2">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-red-100 bg-white/85 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-700">
              Recent activity
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">Events timeline</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Recent execution and reporting events. Older audit history is retained separately so stale tasks do not read like current work.
              </p>
            </div>
          </div>

          {recentEvents.length === 0 ? (
            <BrandedEmptyState
              icon={<Activity className="h-8 w-8 text-red-600" />}
              title="No recent events"
              description={historicalEvents.length > 0 ? `No activity has been reported in the last ${RECENT_ACTIVITY_WINDOW_DAYS} days. Older history is preserved below.` : "This agent has not reported any timeline events yet. When it does, recent entries will appear here."}
              className="px-5 py-12"
            />
          ) : (
            <div className="space-y-3">
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-[22px] border border-zinc-200 bg-white/90 p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="inline-flex w-fit items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-700">
                        {formatEventType(event.event_type)}
                      </div>
                      {event.payload && Object.keys(event.payload).length > 0 ? (
                        <pre className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-50/90 p-3 text-xs leading-5 text-zinc-600">
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      ) : (
                        <p className="mt-3 text-sm text-zinc-500">No payload captured for this event.</p>
                      )}
                    </div>
                    <div className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-500 shadow-sm">
                      {new Date(event.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {historicalEvents.length > 0 ? (
            <div className="space-y-3 border-t border-zinc-200 pt-5">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-zinc-900">Older activity history</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Retained for auditability, but separated from the active timeline.
                </p>
              </div>
              <div className="space-y-3">
                {historicalEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-[22px] border border-zinc-200 bg-zinc-50/80 p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="inline-flex w-fit items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-700">
                          {formatEventType(event.event_type)}
                        </div>
                        {event.payload && Object.keys(event.payload).length > 0 ? (
                          <pre className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white/90 p-3 text-xs leading-5 text-zinc-600">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        ) : (
                          <p className="mt-3 text-sm text-zinc-500">No payload captured for this event.</p>
                        )}
                      </div>
                      <div className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-500 shadow-sm">
                        {new Date(event.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

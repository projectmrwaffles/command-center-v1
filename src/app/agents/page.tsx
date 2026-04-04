import Link from "next/link";
import { ArrowRight, Bot, Radar, Sparkles, Workflow } from "lucide-react";
import { createServerClient, isMockMode } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";
import { DbBanner } from "@/components/db-banner";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { PageHero, PageHeroStat } from "@/components/ui/page-hero";
import {
  formatAgentType,
  formatLastSeen,
  getAgentDisplayName,
  getAgentEmoji,
  getAgentStatusLabel,
  statusClasses,
} from "./agent-utils";

export const dynamic = "force-dynamic";

type AgentRow = { id: string; name: string; type: string; status: string; last_seen: string | null };

export default async function AgentsPage() {
  const db = createServerClient();
  let agents: AgentRow[] = [];
  let error: { message: string; details?: string } | null = null;

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
    const res = await db
      .from("agents")
      .select("id, name, type, status, last_seen")
      .not("name", "like", "_archived_%")
      .order("name");
    agents = (res.data ?? []) as AgentRow[];
  } catch (err) {
    error = {
      message: "Failed to load agents",
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (error) {
    return (
      <div className="space-y-6">
        <DbBanner />
        <h1 className="text-2xl font-bold text-red-600">Agents</h1>
        <ErrorState title="Error loading data" message={error.message} details={error.details} />
      </div>
    );
  }

  const mockBanner = isMockMode() ? (
    <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
      <span className="font-medium">Demo mode</span> – backend not connected.
    </div>
  ) : null;

  const activeAgents = agents.filter((agent) => getAgentStatusLabel(agent.status) === "active").length;
  const idleAgents = agents.filter((agent) => getAgentStatusLabel(agent.status) === "idle").length;

  return (
    <div className="space-y-6">
      <DbBanner />
      {mockBanner}

      <PageHero>
        <div className="flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-700 shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Agent workspace
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
                Agents, presence, and execution context in one focused workspace.
              </h1>
              <p className="max-w-xl text-sm leading-6 text-zinc-600 sm:text-base">
                Review every registered agent, scan live presence, and open a detail route for recent activity without changing how the workspace behaves.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <PageHeroStat className="border-zinc-200 bg-white">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                <Bot className="h-4 w-4 text-red-500" />
                Agents
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{agents.length}</div>
              <p className="mt-1 text-xs text-zinc-500">Registered in the workspace.</p>
            </PageHeroStat>
            <PageHeroStat className="border-emerald-100 shadow-[0_8px_24px_rgba(16,185,129,0.08)]">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                <Radar className="h-4 w-4 text-emerald-500" />
                Active now
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{activeAgents}</div>
              <p className="mt-1 text-xs text-zinc-500">Currently marked active.</p>
            </PageHeroStat>
            <PageHeroStat className="border-zinc-200 bg-white">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                <Workflow className="h-4 w-4 text-red-500" />
                Idle / standby
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{idleAgents}</div>
              <p className="mt-1 text-xs text-zinc-500">Available but not actively running.</p>
            </PageHeroStat>
          </div>
        </div>
      </PageHero>

      {agents.length === 0 ? (
        <BrandedEmptyState
          icon={<Bot className="h-8 w-8 text-red-600" />}
          title="No agents registered"
          description="Agents will appear here once they connect and begin reporting presence to the workspace."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`} className="group block h-full">
              <Card variant="featured" className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-[24px]">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 via-red-500 to-rose-400 opacity-70 transition-opacity duration-200 group-hover:opacity-100" />
                <CardContent className="flex h-full flex-col gap-5 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-2xl">
                          <span aria-hidden="true">{getAgentEmoji(agent.name)}</span>
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-semibold tracking-tight text-zinc-950">
                            {getAgentDisplayName(agent.name)}
                          </h2>
                          <p className="mt-1 text-sm text-zinc-500">{formatAgentType(agent.type)}</p>
                        </div>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${statusClasses(agent.status)}`}>
                        {getAgentStatusLabel(agent.status)}
                      </span>
                    </div>
                    <div className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm transition-colors group-hover:border-red-200 group-hover:text-red-600">
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>

                  <div className="mt-auto rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Last seen</p>
                    <p className="mt-1 text-sm text-zinc-700">{formatLastSeen(agent.last_seen)}</p>
                    <p className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-zinc-700">
                      Open agent detail
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

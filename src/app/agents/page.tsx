import Link from "next/link";
import { Bot, Radar, Sparkles, Workflow } from "lucide-react";
import { createServerClient, isMockMode } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";
import { DbBanner } from "@/components/db-banner";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import {
  EntityCard,
  EntityCardAction,
  EntityCardAvatar,
  EntityCardFooterCta,
  EntityCardHeader,
  EntityCardIdentity,
  EntityCardMetric,
  EntityCardStatus,
  EntityCardSubtitle,
  EntityCardTitle,
} from "@/components/ui/entity-card";
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
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-panel/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-text-secondary shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Agent workspace
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
                Agents, presence, and execution context in one focused workspace.
              </h1>
              <p className="max-w-xl text-sm leading-6 text-text-secondary sm:text-base">
                Review every registered agent, scan live presence, and open a detail route for recent activity without changing how the workspace behaves.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <PageHeroStat className="border-border bg-panel">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                <Bot className="h-4 w-4 text-red-500" />
                Agents
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-text">{agents.length}</div>
              <p className="mt-1 text-xs text-text-muted">Registered in the workspace.</p>
            </PageHeroStat>
            <PageHeroStat className="border-emerald-100 shadow-[0_8px_24px_rgba(16,185,129,0.08)]">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                <Radar className="h-4 w-4 text-emerald-500" />
                Active now
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-text">{activeAgents}</div>
              <p className="mt-1 text-xs text-text-muted">Currently marked active.</p>
            </PageHeroStat>
            <PageHeroStat className="border-border bg-panel">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                <Workflow className="h-4 w-4 text-red-500" />
                Idle / standby
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-text">{idleAgents}</div>
              <p className="mt-1 text-xs text-text-muted">Available but not actively running.</p>
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
              <EntityCard interactive>
                <EntityCardHeader>
                  <EntityCardIdentity>
                    <div className="flex items-center gap-3">
                      <EntityCardAvatar>
                        <span aria-hidden="true">{getAgentEmoji(agent.name)}</span>
                      </EntityCardAvatar>
                      <div className="min-w-0">
                        <EntityCardTitle>{getAgentDisplayName(agent.name)}</EntityCardTitle>
                        <EntityCardSubtitle>{formatAgentType(agent.type)}</EntityCardSubtitle>
                      </div>
                    </div>
                    <EntityCardStatus className={statusClasses(agent.status)}>
                      {getAgentStatusLabel(agent.status)}
                    </EntityCardStatus>
                  </EntityCardIdentity>
                  <EntityCardAction accent="red" />
                </EntityCardHeader>

                <EntityCardMetric accent="zinc" className="mt-auto">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">Last seen</p>
                  <p className="mt-1 text-sm text-text-secondary">{formatLastSeen(agent.last_seen)}</p>
                  <EntityCardFooterCta className="mt-2">Open agent detail</EntityCardFooterCta>
                </EntityCardMetric>
              </EntityCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

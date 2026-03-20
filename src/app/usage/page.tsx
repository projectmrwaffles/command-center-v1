import type { ReactNode } from "react";
import { Sparkles, ReceiptText, Coins, BadgeDollarSign, BrainCircuit, BarChart3 } from "lucide-react";
import { DbBanner } from "@/components/db-banner";
import { createServerClient } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import { PageHero, PageHeroStat } from "@/components/ui/page-hero";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type UsageRow = {
  model: string;
  provider: string;
  total_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
};

type UsageRollup = {
  model: string;
  provider: string;
  tokens: number;
  cost: number;
};

function getOneDayAgo(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

function SectionTitle({ children, meta }: { children: ReactNode; meta?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">{children}</h2>
      {meta ? <p className="text-sm text-zinc-500">{meta}</p> : null}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "red" | "amber" | "emerald";
}) {
  const tones = {
    red: {
      wrap: "border-red-100 bg-white/88",
      badge: "border-red-100 bg-red-50 text-red-700",
    },
    amber: {
      wrap: "border-amber-100 bg-white/88",
      badge: "border-amber-100 bg-amber-50 text-amber-700",
    },
    emerald: {
      wrap: "border-emerald-100 bg-white/88",
      badge: "border-emerald-100 bg-emerald-50 text-emerald-700",
    },
  } satisfies Record<string, { wrap: string; badge: string }>;

  return (
    <Card variant="soft" className={cn("rounded-[24px] shadow-[0_12px_32px_rgba(24,24,27,0.05)]", tones[tone].wrap)}>
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">{value}</p>
          </div>
          <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm", tones[tone].badge)}>
            {icon}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function UsagePage() {
  const db = createServerClient();

  let rows: UsageRow[] = [];
  let error: string | null = null;

  if (db) {
    try {
      const oneDayAgo = getOneDayAgo();
      const res = await db
        .from("ai_usage")
        .select("model, provider, total_tokens, cost_usd, created_at")
        .gte("created_at", oneDayAgo)
        .order("created_at", { ascending: false })
        .limit(200);

      rows = (res.data ?? []) as UsageRow[];
    } catch (err: any) {
      error = err?.message ?? "Unknown error";
    }
  }

  const totalTokens = rows.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0);
  const totalCost = rows.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
  const byModel = new Map<string, UsageRollup>();

  rows.forEach((r) => {
    const key = `${r.provider}:${r.model}`;
    const existing = byModel.get(key) ?? {
      model: r.model ?? "unknown",
      provider: r.provider ?? "unknown",
      tokens: 0,
      cost: 0,
    };
    existing.tokens += r.total_tokens ?? 0;
    existing.cost += Number(r.cost_usd) || 0;
    byModel.set(key, existing);
  });

  const top = Array.from(byModel.values()).sort((a, b) => b.tokens - a.tokens).slice(0, 8);

  return (
    <div className="space-y-6 md:space-y-8">
      <DbBanner />

      <PageHero>
        <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700 shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-red-500" />
              Usage intelligence
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Usage</h1>
              <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
                A warm 24-hour rollup of token spend, cost, and the models doing most of the work across the workspace.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <PageHeroStat className="border-red-100">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-red-700">
                  <ReceiptText className="h-4 w-4 text-red-500" />
                  Records
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{rows.length}</div>
              </PageHeroStat>
              <PageHeroStat className="border-amber-100 shadow-[0_8px_24px_rgba(245,158,11,0.08)]">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-amber-700">
                  <BadgeDollarSign className="h-4 w-4 text-amber-500" />
                  Spend window
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">24h</div>
              </PageHeroStat>
              <PageHeroStat className="border-emerald-100 shadow-[0_8px_24px_rgba(16,185,129,0.08)]">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
                  <BrainCircuit className="h-4 w-4 text-emerald-500" />
                  Distinct models
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{byModel.size}</div>
              </PageHeroStat>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[290px] lg:items-end">
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_12px_32px_rgba(239,68,68,0.12)] backdrop-blur lg:max-w-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <BarChart3 className="h-4 w-4 text-red-500" />
                Last 24 hours
              </div>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                Metrics stay scoped to the latest day so spend and model mix are easy to compare at a glance.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                  {totalTokens.toLocaleString()} tokens
                </span>
                <span className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  ${totalCost.toFixed(4)} total cost
                </span>
              </div>
            </div>
            <p className="px-1 text-xs text-zinc-500">Existing usage data, content, and ranking logic preserved.</p>
          </div>
        </div>
      </PageHero>

      {error && (
        <ErrorState
          title="Error loading usage"
          message={error}
          details="If tables are missing, apply migrations in Supabase SQL Editor."
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard icon={<Coins className="h-5 w-5" />} label="Total tokens (24h)" value={totalTokens.toLocaleString()} tone="red" />
        <SummaryCard icon={<BadgeDollarSign className="h-5 w-5" />} label="Total cost (24h)" value={`$${totalCost.toFixed(4)}`} tone="amber" />
        <SummaryCard icon={<BrainCircuit className="h-5 w-5" />} label="Models" value={byModel.size.toLocaleString()} tone="emerald" />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle meta="Same top-model ranking, now presented with the shared warm card and badge language.">Top models</SectionTitle>
          {top.length > 0 ? <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">Top 8 by tokens</span> : null}
        </div>

        {top.length === 0 ? (
          <BrandedEmptyState
            className="items-start px-6 py-10 text-left"
            icon={<BrainCircuit className="h-7 w-7 text-red-600" />}
            title="No usage yet"
            description="Model usage will show up here once jobs begin spending tokens in the last 24 hours."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {top.map((m, index) => (
              <Card key={`${m.provider}:${m.model}`} variant="featured" className="overflow-hidden rounded-[24px]">
                <div className="h-1 w-full bg-gradient-to-r from-red-500 via-red-500 to-amber-400 opacity-70" />
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-700">
                        #{index + 1}
                      </span>
                      <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                        {m.provider}
                      </span>
                    </div>
                    <div>
                      <p className="truncate text-base font-semibold tracking-tight text-zinc-950">{m.model}</p>
                      <p className="mt-1 text-sm text-zinc-500">Provider preserved from usage rollup.</p>
                    </div>
                  </div>

                  <div className="min-w-[120px] rounded-2xl border border-red-100 bg-[linear-gradient(180deg,rgba(254,242,242,0.92),rgba(255,255,255,0.98))] p-4 text-right">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Tokens</p>
                    <p className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">{m.tokens.toLocaleString()}</p>
                    <p className="mt-2 text-xs text-zinc-500">${m.cost.toFixed(4)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

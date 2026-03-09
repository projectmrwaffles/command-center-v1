import { DbBanner } from "@/components/db-banner";
import { createServerClient } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type UsageRow = {
  model: string;
  provider: string;
  total_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
};

function getOneDayAgo(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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

  // rollups
  const totalTokens = rows.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0);
  const totalCost = rows.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
  const byModel = new Map<string, { model: string; provider: string; tokens: number; cost: number }>();

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
    <div className="space-y-6">
      <DbBanner />

      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Usage</h1>
        <p className="text-sm text-zinc-500">Last 24 hours</p>
      </div>

      {error && (
        <ErrorState
          title="Error loading usage"
          message={error}
          details="If tables are missing, apply migrations in Supabase SQL Editor."
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total tokens (24h)</CardDescription>
            <CardTitle className="text-2xl">{totalTokens.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total cost (24h)</CardDescription>
            <CardTitle className="text-2xl">${totalCost.toFixed(4)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Models</CardDescription>
            <CardTitle className="text-2xl">{byModel.size}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Top models</h2>
        <div className="grid grid-cols-1 gap-3">
          {top.map((m) => (
            <Card key={`${m.provider}:${m.model}`} className="border-zinc-200">
              <CardContent className="flex items-center justify-between py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{m.model}</p>
                  <p className="text-xs text-zinc-500">{m.provider}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-zinc-900">{m.tokens.toLocaleString()}</p>
                  <p className="text-xs text-zinc-500">${m.cost.toFixed(4)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {top.length === 0 && <p className="text-sm text-zinc-500">No usage yet.</p>}
        </div>
      </section>
    </div>
  );
}

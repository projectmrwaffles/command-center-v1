import Link from "next/link";
import { ArrowRight, FolderKanban, Sparkles, Users } from "lucide-react";
import { DbBanner } from "@/components/db-banner";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import { PageHero, PageHeroStat } from "@/components/ui/page-hero";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type TeamRow = {
  id: string;
  name: string;
  description: string | null;
};

export default async function TeamsPage() {
  const db = createServerClient();
  let teams: TeamRow[] = [];
  let error: string | null = null;

  if (db) {
    try {
      const res = await db.from("teams").select("id, name, description").order("name");
      teams = (res.data ?? []) as TeamRow[];
    } catch (err: any) {
      error = err?.message ?? "Unknown error";
    }
  }

  return (
    <div className="space-y-6">
      <DbBanner />

      <PageHero>
        <div className="flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-700 shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Team workspace
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
                Teams, ownership, and warm rollups in one place.
              </h1>
              <p className="max-w-xl text-sm leading-6 text-zinc-600 sm:text-base">
                Browse each team’s current coverage, see who is active, and jump straight into the projects they’re responsible for.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <PageHeroStat className="border-red-100">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                <Users className="h-4 w-4 text-red-500" />
                Teams
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{teams.length}</div>
              <p className="mt-1 text-xs text-zinc-500">Configured groups in the system.</p>
            </PageHeroStat>
            <PageHeroStat className="border-amber-100 shadow-[0_8px_24px_rgba(245,158,11,0.08)]">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                <FolderKanban className="h-4 w-4 text-amber-500" />
                Coverage
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">Live</div>
              <p className="mt-1 text-xs text-zinc-500">Project ownership and member activity.</p>
            </PageHeroStat>
            <PageHeroStat className="border-emerald-100 shadow-[0_8px_24px_rgba(16,185,129,0.08)]">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                <ArrowRight className="h-4 w-4 text-emerald-500" />
                Navigation
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">Direct</div>
              <p className="mt-1 text-xs text-zinc-500">Open any team detail route from here.</p>
            </PageHeroStat>
          </div>
        </div>
      </PageHero>

      {error && (
        <ErrorState
          title="Error loading teams"
          message={error}
          details="If teams table is missing, apply migrations in Supabase SQL Editor."
        />
      )}

      {teams.length === 0 ? (
        <BrandedEmptyState
          icon={<Users className="h-8 w-8 text-red-600" />}
          title="No teams yet"
          description="Teams will appear here once they’ve been configured in the workspace."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {teams.map((t) => (
            <Link key={t.id} href={`/teams/${t.id}`} className="group block h-full">
              <Card variant="featured" className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-[24px]">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 via-red-500 to-rose-400 opacity-70 transition-opacity duration-200 group-hover:opacity-100" />
                <CardContent className="flex h-full flex-col gap-5 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-red-100 bg-red-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-red-700">
                        Team
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight text-zinc-950">{t.name}</h2>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-600">
                          {t.description ?? "No description yet"}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm transition-colors group-hover:border-red-200 group-hover:text-red-600">
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between rounded-2xl border border-red-100/70 bg-[linear-gradient(180deg,rgba(255,249,248,0.82),rgba(255,255,255,0.98))] px-4 py-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Rollups</p>
                      <p className="mt-1 text-sm text-zinc-600">Members, projects, and signals</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-red-700">
                      View details
                      <ArrowRight className="h-4 w-4" />
                    </span>
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

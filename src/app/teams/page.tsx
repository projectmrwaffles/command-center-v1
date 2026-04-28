import Link from "next/link";
import { ArrowRight, FolderKanban, Sparkles, Users } from "lucide-react";
import { DbBanner } from "@/components/db-banner";
import { ErrorState } from "@/components/error-state";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import {
  EntityCard,
  EntityCardAction,
  EntityCardFooterCta,
  EntityCardHeader,
  EntityCardIdentity,
  EntityCardMetric,
  EntityCardSubtitle,
  EntityCardTitle,
} from "@/components/ui/entity-card";
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
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-panel/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-text-secondary shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Team workspace
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
                Teams, ownership, and shared rollups in one place.
              </h1>
              <p className="max-w-xl text-sm leading-6 text-text-secondary sm:text-base">
                Browse each team’s current coverage, see who is active, and jump straight into the projects they’re responsible for.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <PageHeroStat className="border-red-100">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                <Users className="h-4 w-4 text-red-500" />
                Teams
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-text">{teams.length}</div>
              <p className="mt-1 text-xs text-text-muted">Configured groups in the system.</p>
            </PageHeroStat>
            <PageHeroStat className="border-red-100 shadow-[0_8px_24px_rgba(239,68,68,0.08)]">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                <FolderKanban className="h-4 w-4 text-red-500" />
                Coverage
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-text">Live</div>
              <p className="mt-1 text-xs text-text-muted">Project ownership and member activity.</p>
            </PageHeroStat>
            <PageHeroStat className="border-emerald-100 shadow-[0_8px_24px_rgba(16,185,129,0.08)]">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                <ArrowRight className="h-4 w-4 text-emerald-500" />
                Navigation
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-text">Direct</div>
              <p className="mt-1 text-xs text-text-muted">Open any team detail route from here.</p>
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
              <EntityCard interactive>
                <EntityCardHeader>
                  <EntityCardIdentity className="space-y-2">
                    <div>
                      <EntityCardTitle>{t.name}</EntityCardTitle>
                      <EntityCardSubtitle className="mt-2 line-clamp-3 leading-6 text-text-secondary">
                        {t.description ?? "No description yet"}
                      </EntityCardSubtitle>
                    </div>
                  </EntityCardIdentity>
                  <EntityCardAction accent="zinc" />
                </EntityCardHeader>

                <EntityCardMetric accent="zinc" className="mt-auto flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">Rollups</p>
                    <p className="mt-1 text-sm text-text-secondary">Members, projects, and current work</p>
                  </div>
                  <EntityCardFooterCta>View details</EntityCardFooterCta>
                </EntityCardMetric>
              </EntityCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

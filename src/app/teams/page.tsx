import Link from "next/link";
import { DbBanner } from "@/components/db-banner";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Teams</h1>
        <p className="text-sm text-zinc-500">Members, projects, and rollups</p>
      </div>

      {error && (
        <ErrorState
          title="Error loading teams"
          message={error}
          details="If teams table is missing, apply migrations in Supabase SQL Editor."
        />
      )}

      <div className="grid grid-cols-1 gap-4">
        {teams.map((t) => (
          <Link key={t.id} href={`/teams/${t.id}`} className="block">
            <Card className="border-zinc-200 transition-all hover:shadow-md hover:border-zinc-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t.name}</CardTitle>
                <CardDescription>{t.description ?? "—"}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-zinc-500">View rollups →</p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {teams.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
              <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-zinc-700">No teams yet</p>
            <p className="text-sm text-zinc-500">Teams will appear here once configured</p>
          </div>
        )}
      </div>
    </div>
  );
}

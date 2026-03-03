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
        <h1 className="text-lg font-semibold text-zinc-900">Teams</h1>
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
            <Card className="active:bg-zinc-50">
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
        {teams.length === 0 && <p className="text-sm text-zinc-500">No teams yet.</p>}
      </div>
    </div>
  );
}

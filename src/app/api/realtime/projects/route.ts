import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
  if (!auth.ok) return auth.response;

  const db = createServerClient();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  let { data, error } = await db
    .from("projects")
    .select("id, name, status, type, team_id, progress_pct, created_at, updated_at, links")
    .order("created_at", { ascending: false });

  if (error?.code === "PGRST204" && error.message.includes("'links' column")) {
    const fallback = await db
      .from("projects")
      .select("id, name, status, type, team_id, progress_pct, created_at, updated_at")
      .order("created_at", { ascending: false });
    data = (fallback.data ?? []).map((project) => ({ ...project, links: null }));
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}

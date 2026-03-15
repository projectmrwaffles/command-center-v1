import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { authorizeApiRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
  if (!auth.ok) return auth.response;

  const db = createServerClient();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { data, error } = await db.from("usage_rollup_minute").select("*").order("bucket_start", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ usageRollup: data ?? [] });
}

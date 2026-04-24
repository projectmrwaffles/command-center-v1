import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/server-auth";
import { loadProjectSummaryFeed } from "@/lib/project-summary-feed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
  if (!auth.ok) return auth.response;

  const result = await loadProjectSummaryFeed();
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  return NextResponse.json({ projects: result.projects });
}

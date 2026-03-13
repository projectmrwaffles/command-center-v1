import { createServerClient, isMockMode } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";
import { DbBanner } from "@/components/db-banner";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function getAgentDisplayName(name: string) {
  if (name === "main") return "Mr. Waffles";
  return name;
}

// Map of agent name to emoji from their IDENTITY.md
const AGENT_EMOJIS: Record<string, string> = {
  "tech-lead-architect": "🔮",
  "frontend-engineer": "🎨",
  "backend-engineer": "⚡",
  "mobile-engineer": "📱",
  "qa-auditor": "🛡️",
  "seo-web-developer": "🔍",
  "head-of-design": "✨",
  "product-designer-app": "📐",
  "web-designer-marketing": "💡",
  "product-lead": "🧭",
  "growth-lead": "🚀",
  "marketing-producer": "📣",
  "marketing-ops-analytics": "📊",
};

function getAgentEmoji(name: string): string {
  return AGENT_EMOJIS[name] || "🤖";
}

export default async function AgentsPage() {
  const db = createServerClient();
  let agents:
    | { id: string; name: string; type: string; status: string; last_seen: string | null }[]
    | null = null;
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
    agents = res.data;
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
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span className="font-medium">Demo mode</span> – backend not connected.
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      <DbBanner />
      {mockBanner}
      <h1 className="text-2xl font-semibold text-red-600">Agents</h1>

      {/* Mobile cards */}
      <div className="grid gap-4 md:hidden">
        {(agents || []).map((a) => (
          <Link key={a.id} href={`/agents/${a.id}`} className="block">
            <Card className="border-zinc-200 transition-all hover:shadow-md hover:border-zinc-300">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getAgentEmoji(a.name)}</span>
                    <CardTitle className="text-base">{getAgentDisplayName(a.name)}</CardTitle>
                  </div>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {a.status}
                  </span>
                </div>
                <CardDescription>{a.type}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-gray-400">
                  {a.last_seen ? new Date(a.last_seen).toLocaleString() : "Never"}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {(!agents || agents.length === 0) && (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
              <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-zinc-700">No agents registered</p>
            <p className="text-sm text-zinc-500">Agents will appear here once they connect</p>
          </div>
        )}
      </div>

      {/* Desktop list/table */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(agents || []).map((a) => (
              <tr key={a.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <Link href={`/agents/${a.id}`} className="flex items-center gap-2 font-medium text-zinc-900 hover:underline">
                    <span className="text-lg">{getAgentEmoji(a.name)}</span>
                    {getAgentDisplayName(a.name)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-500">{a.type}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {a.last_seen ? new Date(a.last_seen).toLocaleString() : "Never"}
                </td>
              </tr>
            ))}
            {(!agents || agents.length === 0) && (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-400" colSpan={4}>
                  <div className="flex flex-col items-center">
                    <p>No agents registered</p>
                    <p className="text-xs">Agents will appear here once they connect</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

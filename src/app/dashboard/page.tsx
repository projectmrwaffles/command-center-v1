import { createServerClient } from "@/lib/supabase-server";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatTimeAgo(ts?: string | null) {
  if (!ts) return "—";
  const then = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

export default async function DashboardPage() {
  const db = createServerClient();

  const { data: agents } = await db.from("agents").select("id, name, status, last_seen");
  const online = (agents || []).filter((a) => a.status === "active").length;
  const offline = (agents || []).filter((a) => a.status !== "active").length;

  const { data: approvals } = await db
    .from("approvals")
    .select("id")
    .eq("status", "pending");
  const pendingCount = (approvals || []).length;

  const { data: events } = await db
    .from("agent_events")
    .select("id, agent_id, event_type, payload, timestamp")
    .order("timestamp", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-red-600">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl leading-tight text-green-700">{online}</CardTitle>
            <CardDescription className="text-green-600">Online Agents</CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-gray-200 bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl leading-tight text-gray-700">{offline}</CardTitle>
            <CardDescription className="text-gray-600">Offline Agents</CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl leading-tight text-red-700">{pendingCount}</CardTitle>
            <CardDescription className="text-red-600">Pending Approvals</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Recent Events */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Recent Events</h2>
        <div className="space-y-3">
          {(events || []).map((e) => (
            <Card key={e.id} className="border-zinc-200">
              <CardContent className="flex items-start justify-between py-4">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900">{e.event_type}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Agent: {e.agent_id?.slice(0, 8) ?? "—"}…
                  </p>
                </div>
                <span className="whitespace-nowrap text-xs text-zinc-400">
                  {formatTimeAgo(e.timestamp)}
                </span>
              </CardContent>
            </Card>
          ))}
          {(!events || events.length === 0) && (
            <p className="text-sm text-zinc-400">No events yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

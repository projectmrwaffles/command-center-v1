import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

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
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-red-600">Dashboard</h1>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{online}</p>
          <p className="text-xs text-green-600 mt-1">Online</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-700">{offline}</p>
          <p className="text-xs text-gray-500 mt-1">Offline</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{pendingCount}</p>
          <p className="text-xs text-red-600 mt-1">Pending</p>
        </div>
      </div>

      {/* Last 10 events */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Recent Events</h2>
        <div className="space-y-2">
          {(events || []).map((e) => (
            <div
              key={e.id}
              className="border rounded-lg p-3 text-sm flex justify-between items-start"
            >
              <div>
                <span className="font-medium">{e.event_type}</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Agent: {e.agent_id?.slice(0, 8)}…
                </p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
          {(!events || events.length === 0) && (
            <p className="text-gray-400 text-sm">No events yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

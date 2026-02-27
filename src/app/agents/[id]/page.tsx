import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createServerClient();

  const { data: agent } = await db
    .from("agents")
    .select("id, name, type, status, last_seen")
    .eq("id", id)
    .single();

  const { data: events } = await db
    .from("agent_events")
    .select("id, event_type, payload, timestamp")
    .eq("agent_id", id)
    .order("timestamp", { ascending: false })
    .limit(20);

  if (!agent) {
    return <p className="p-6 text-gray-500">Agent not found.</p>;
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{agent.name}</h1>
        <div className="flex gap-2 mt-1 items-center">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
              agent.status === "active"
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {agent.status}
          </span>
          <span className="text-xs text-gray-400">
            Last seen:{" "}
            {agent.last_seen
              ? new Date(agent.last_seen).toLocaleString()
              : "Never"}
          </span>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Events Timeline</h2>
        <div className="space-y-2">
          {(events || []).map((e) => (
            <div key={e.id} className="border rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{e.event_type}</span>
                <span className="text-xs text-gray-400">
                  {new Date(e.timestamp).toLocaleString()}
                </span>
              </div>
              {e.payload && Object.keys(e.payload).length > 0 && (
                <pre className="text-xs text-gray-500 mt-1 overflow-x-auto">
                  {JSON.stringify(e.payload, null, 2)}
                </pre>
              )}
            </div>
          ))}
          {(!events || events.length === 0) && (
            <p className="text-gray-400 text-sm">No events.</p>
          )}
        </div>
      </div>
    </div>
  );
}

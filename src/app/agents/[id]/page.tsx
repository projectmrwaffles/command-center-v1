import { createServerClient, isMockMode } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";

export const dynamic = "force-dynamic";

type Agent = { id: string; name: string; type: string; status: string; last_seen: string | null };

type AgentEvent = { id: string; event_type: string; payload: object; timestamp: string };

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let agent: Agent | null = null;
  let events: AgentEvent[] | null = null;
  let error: { message: string; details?: string } | null = null;

  try {
    const db = createServerClient();
    const agentRes = await db
      .from("agents")
      .select("id, name, type, status, last_seen")
      .eq("id", id)
      .single();
    agent = agentRes.data;

    const eventsRes = await db
      .from("agent_events")
      .select("id, event_type, payload, timestamp")
      .eq("agent_id", id)
      .order("timestamp", { ascending: false })
      .limit(20);
    events = eventsRes.data;
  } catch (err) {
    error = {
      message: "Failed to load agent details",
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-red-600">Agent Detail</h1>
        <ErrorState title="Error loading data" message={error.message} details={error.details} />
      </div>
    );
  }

  if (!agent) {
    return <p className="p-6 text-gray-500">Agent not found.</p>;
  }

  const a = agent as NonNullable<typeof agent>;

  const mockBanner = isMockMode() ? (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span className="font-medium">Demo mode</span> – backend not connected.
    </div>
  ) : null;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      {mockBanner}
      <div>
        <h1 className="text-2xl font-bold">{a.name}</h1>
        <div className="flex gap-2 mt-1 items-center">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
              a.status === "active"
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {a.status}
          </span>
          <span className="text-xs text-gray-400">
            Last seen:{" "}
            {a.last_seen
              ? new Date(a.last_seen).toLocaleString()
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

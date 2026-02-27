import { createServerClient } from "@/lib/supabase-server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const db = createServerClient();
  const { data: agents } = await db
    .from("agents")
    .select("id, name, type, status, last_seen")
    .order("name");

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-red-600">Agents</h1>
      <div className="space-y-3">
        {(agents || []).map((a) => (
          <Link key={a.id} href={`/agents/${a.id}`} className="block">
            <div className="border rounded-xl p-4 flex justify-between items-center active:bg-gray-50">
              <div>
                <p className="font-semibold">{a.name}</p>
                <p className="text-xs text-gray-500">{a.type}</p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    a.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {a.status}
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  {a.last_seen
                    ? new Date(a.last_seen).toLocaleString()
                    : "Never"}
                </p>
              </div>
            </div>
          </Link>
        ))}
        {(!agents || agents.length === 0) && (
          <p className="text-gray-400 text-sm">No agents registered.</p>
        )}
      </div>
    </div>
  );
}

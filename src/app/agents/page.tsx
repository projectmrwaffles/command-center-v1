import { createServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const db = createServerClient();
  const { data: agents } = await db
    .from("agents")
    .select("id, name, type, status, last_seen")
    .order("name");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-red-600">Agents</h1>

      {/* Mobile cards */}
      <div className="grid gap-4 md:hidden">
        {(agents || []).map((a) => (
          <Link key={a.id} href={`/agents/${a.id}`} className="block">
            <Card className="active:bg-zinc-50">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{a.name}</CardTitle>
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
                  {a.last_seen
                    ? new Date(a.last_seen).toLocaleString()
                    : "Never"}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {(!agents || agents.length === 0) && (
          <p className="text-sm text-zinc-400">No agents registered.</p>
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
                  <Link href={`/agents/${a.id}`} className="font-medium text-zinc-900 hover:underline">
                    {a.name}
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
                  {a.last_seen
                    ? new Date(a.last_seen).toLocaleString()
                    : "Never"}
                </td>
              </tr>
            ))}
            {(!agents || agents.length === 0) && (
              <tr>
                <td className="px-4 py-4 text-zinc-400" colSpan={4}>
                  No agents registered.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

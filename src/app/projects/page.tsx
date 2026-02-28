import { createServerClient } from "@/lib/supabase-server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const db = createServerClient();
  const { data: projects } = await db
    .from("projects")
    .select("id, title, status, created_at, agent_id")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-red-600">Projects</h1>

      {/* Mobile cards */}
      <div className="grid gap-4 md:hidden">
        {(projects || []).map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="block">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm active:bg-zinc-50">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-zinc-900">{p.title || "Untitled"}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Agent: {p.agent_id?.slice(0, 8) ?? "—"}…
                  </p>
                </div>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.status === "active"
                      ? "bg-green-100 text-green-700"
                      : p.status === "completed"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {p.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                Created {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
              </p>
            </div>
          </Link>
        ))}
        {(!projects || projects.length === 0) && (
          <p className="text-sm text-zinc-400">No projects yet.</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(projects || []).map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <Link href={`/projects/${p.id}`} className="font-medium text-zinc-900 hover:underline">
                    {p.title || "Untitled"}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.status === "active"
                        ? "bg-green-100 text-green-700"
                        : p.status === "completed"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500">{p.agent_id?.slice(0, 8) ?? "—"}…</td>
                <td className="px-4 py-3 text-zinc-500">
                  {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
            {(!projects || projects.length === 0) && (
              <tr>
                <td className="px-4 py-4 text-zinc-400" colSpan={4}>
                  No projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { createServerClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function handleApproval(formData: FormData) {
  "use server";
  const db = createServerClient();
  const id = formData.get("id") as string;
  const action = formData.get("action") as string;
  const note = formData.get("note") as string;

  if (action === "changes_requested" && (!note || note.trim() === "")) {
    // Note required for request changes — redirect back
    redirect("/approvals?error=note_required");
  }

  await db
    .from("approvals")
    .update({
      status: action === "approve" ? "approved" : "changes_requested",
      note: note || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Also update the job status
  const { data: approval } = await db
    .from("approvals")
    .select("job_id")
    .eq("id", id)
    .single();

  if (approval?.job_id) {
    await db
      .from("jobs")
      .update({
        status: action === "approve" ? "in_progress" : "blocked",
        updated_at: new Date().toISOString(),
      })
      .eq("id", approval.job_id);
  }

  revalidatePath("/approvals");
  redirect("/approvals");
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const db = createServerClient();

  const { data: approvals } = await db
    .from("approvals")
    .select("id, status, summary, note, decided_at, agent_id, job_id, created_at")
    .order("created_at", { ascending: false });

  const pending = (approvals || []).filter((a) => a.status === "pending");
  const resolved = (approvals || []).filter((a) => a.status !== "pending");

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-red-600">Approvals</h1>

      {sp.error === "note_required" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          Note is required when requesting changes.
        </div>
      )}

      {/* Pending */}
      <div>
        <h2 className="text-lg font-semibold mb-2">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 && (
          <p className="text-gray-400 text-sm">No pending approvals.</p>
        )}
        {pending.map((a) => (
          <div key={a.id} className="border rounded-xl p-4 space-y-3 mb-3">
            <div>
              <p className="font-medium text-sm">{a.summary || "No summary"}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Agent: {a.agent_id?.slice(0, 8)}… · Job: {a.job_id?.slice(0, 8)}…
              </p>
              <p className="text-xs text-gray-400">
                Requested: {new Date(a.created_at).toLocaleString()}
              </p>
            </div>
            <form action={handleApproval} className="space-y-2">
              <input type="hidden" name="id" value={a.id} />
              <textarea
                name="note"
                placeholder="Note (required for Request Changes)"
                className="w-full border rounded-lg p-2 text-sm resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  name="action"
                  value="approve"
                  className="flex-1 bg-red-600 text-white rounded-lg py-3 font-semibold text-sm"
                >
                  Approve
                </button>
                <button
                  type="submit"
                  name="action"
                  value="changes_requested"
                  className="flex-1 bg-gray-200 text-gray-800 rounded-lg py-3 font-semibold text-sm"
                >
                  Request Changes
                </button>
              </div>
            </form>
          </div>
        ))}
      </div>

      {/* Audit trail */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Audit Trail</h2>
        {resolved.length === 0 && (
          <p className="text-gray-400 text-sm">No resolved approvals yet.</p>
        )}
        {resolved.map((a) => (
          <div key={a.id} className="border rounded-lg p-3 mb-2 text-sm">
            <div className="flex justify-between items-start">
              <div>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    a.status === "approved"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {a.status}
                </span>
                <p className="mt-1">{a.summary || "No summary"}</p>
                {a.note && (
                  <p className="text-xs text-gray-500 mt-0.5 italic">
                    Note: {a.note}
                  </p>
                )}
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {a.decided_at
                  ? new Date(a.decided_at).toLocaleString()
                  : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

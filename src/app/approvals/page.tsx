import { createServerClient, isMockMode } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export const dynamic = "force-dynamic";

async function handleApproval(formData: FormData) {
  "use server";
  
  // Guard: cannot process approvals in mock mode
  if (isMockMode()) {
    redirect("/approvals?error=demo_mode_no_approvals");
  }
  
  const db = createServerClient();
  const id = formData.get("id") as string;
  const action = formData.get("action") as string;
  const note = formData.get("note") as string;

  if (action === "changes_requested" && (!note || note.trim() === "")) {
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
  let approvals: { id: string; status: string; summary: string; note: string; decided_at: string | null; agent_id: string; job_id: string; created_at: string }[] | null = null;
  let error: { message: string; details?: string } | null = null;

  try {
    const db = createServerClient();
    const res = await db
      .from("approvals")
      .select("id, status, summary, note, decided_at, agent_id, job_id, created_at")
      .order("created_at", { ascending: false });
    approvals = res.data;
  } catch (err) {
    error = {
      message: "Failed to load approvals",
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-red-600">Approvals</h1>
        <ErrorState title="Error loading data" message={error.message} details={error.details} />
      </div>
    );
  }

  const pending = (approvals || []).filter((a) => a.status === "pending");
  const resolved = (approvals || []).filter((a) => a.status !== "pending");
  const mockBanner = isMockMode() ? (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span className="font-medium">Demo mode</span> – backend not connected.
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      {mockBanner}
      <h1 className="text-2xl font-bold text-red-600">Approvals</h1>

      {sp.error === "note_required" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Note is required when requesting changes.
        </div>
      )}

      {sp.error === "demo_mode_no_approvals" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          Approvals cannot be processed in demo mode.
        </div>
      )}

      {/* Pending */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Pending ({pending.length})</h2>
        {pending.length === 0 && (
          <p className="text-sm text-zinc-400">No pending approvals.</p>
        )}
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {pending.map((a) => (
            <Card key={a.id} className="relative">
              <CardHeader>
                <CardTitle className="text-sm">{a.summary || "No summary"}</CardTitle>
                <CardDescription>
                  Agent: {a.agent_id?.slice(0, 8)}… · Job: {a.job_id?.slice(0, 8)}…
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={handleApproval} id={`form-${a.id}`} className="space-y-3">
                  <input type="hidden" name="id" value={a.id} />
                  <textarea
                    name="note"
                    placeholder="Note (required for Request Changes)"
                    className="w-full rounded-md border border-zinc-200 bg-white p-2 text-sm focus:border-zinc-400 focus:outline-none"
                    rows={2}
                  />
                </form>
              </CardContent>
              {/* Mobile sticky action bar */}
              <CardFooter
                data-testid="sticky-action-bar"
                className="sticky bottom-16 z-40 flex gap-2 bg-white/95 backdrop-blur md:static md:bg-transparent md:backdrop-blur-none"
              >
                <Button
                  type="submit"
                  form={`form-${a.id}`}
                  name="action"
                  value="approve"
                  variant="default"
                  className="flex-1 bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  Approve
                </Button>
                <Button
                  type="submit"
                  form={`form-${a.id}`}
                  name="action"
                  value="changes_requested"
                  variant="secondary"
                  className="flex-1 bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                >
                  Request Changes
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {/* Audit trail */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Audit Trail</h2>
        {resolved.length === 0 && (
          <p className="text-sm text-zinc-400">No resolved approvals yet.</p>
        )}
        <div className="space-y-3">
          {resolved.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 text-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {a.status}
                  </span>
                  <p className="mt-1">{a.summary || "No summary"}</p>
                  {a.note && (
                    <p className="mt-0.5 text-xs italic text-zinc-500">
                      Note: {a.note}
                    </p>
                  )}
                </div>
                <span className="whitespace-nowrap text-xs text-zinc-400">
                  {a.decided_at ? new Date(a.decided_at).toLocaleString() : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";
import { DbBanner } from "@/components/db-banner";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type ApprovalRow = {
  id: string;
  status: string;
  summary: string | null;
  note: string | null;
  decided_at: string | null;
  agent_id: string | null;
  job_id: string | null;
  project_id: string | null;
  severity: string | null;
  requester_name: string | null;
  created_at: string;
  agents?: { name: string; title: string | null } | { name: string; title: string | null }[] | null;
  jobs?: { title: string | null; status: string | null } | { title: string | null; status: string | null }[] | null;
  projects?: { name: string | null } | { name: string | null }[] | null;
};

function getJoinedRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Not set";
  return status.replace(/_/g, " ");
}

function timeAgo(ts?: string | null) {
  if (!ts) return "Not available";
  const diffMs = Date.now() - new Date(ts).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function handleApproval(formData: FormData) {
  "use server";

  const db = createServerClient();
  if (!db) {
    redirect("/approvals?error=db_not_initialized");
  }

  const id = formData.get("id") as string;
  const decision = formData.get("decision") as string;
  const note = formData.get("note") as string;

  if (decision === "changes_requested" && (!note || note.trim() === "")) {
    redirect("/approvals?error=note_required");
  }

  const { data: existingApproval } = await db
    .from("approvals")
    .select("id, project_id, job_id, agent_id, summary, status")
    .eq("id", id)
    .single();

  await db
    .from("approvals")
    .update({
      status: decision === "approve" ? "approved" : "changes_requested",
      note: note || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (existingApproval?.job_id) {
    await db
      .from("jobs")
      .update({
        status: decision === "approve" ? "in_progress" : "blocked",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingApproval.job_id);
  }

  if (existingApproval?.project_id) {
    await db.from("agent_events").insert({
      agent_id: existingApproval.agent_id,
      project_id: existingApproval.project_id,
      job_id: existingApproval.job_id,
      event_type: "approval_decided",
      payload: {
        approval_id: id,
        summary: existingApproval.summary,
        previous_status: existingApproval.status,
        decision: decision === "approve" ? "approved" : "changes_requested",
        note: note || null,
      },
    });
  }

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  if (existingApproval?.project_id) {
    revalidatePath(`/projects/${existingApproval.project_id}`);
  }
  redirect("/approvals");
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const db = createServerClient();
  let approvals: ApprovalRow[] | null = null;
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
      .from("approvals")
      .select("id, status, summary, note, decided_at, agent_id, job_id, project_id, severity, requester_name, created_at, agents(name, title), jobs(title, status), projects(name)")
      .order("created_at", { ascending: false });
    approvals = (res.data ?? null) as ApprovalRow[] | null;
  } catch (err) {
    error = {
      message: "Failed to load approvals",
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (error) {
    return (
      <div className="space-y-6">
        <DbBanner />
        <h1 className="text-2xl font-bold text-red-600">Approvals</h1>
        <ErrorState title="Error loading data" message={error.message} details={error.details} />
      </div>
    );
  }

  const pending = (approvals || []).filter((a) => a.status === "pending");
  const resolved = (approvals || []).filter((a) => a.status !== "pending");

  return (
    <div className="space-y-6">
      <DbBanner />

      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Approvals</h1>
        <p className="text-sm text-zinc-500">Review operator decisions with project context, current job state, and an audit trail. Use approvals for trust gates; use project tasks for the delivery plan.</p>
      </div>

      {sp.error === "note_required" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Note is required when requesting changes.
        </div>
      )}

      {sp.error === "db_not_initialized" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          Database not initialized. Apply migrations first.
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Pending ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-zinc-500">No pending approvals.</p>}
        <div className="space-y-4">
          {pending.map((a) => {
            const agent = getJoinedRow(a.agents);
            const job = getJoinedRow(a.jobs);
            const project = getJoinedRow(a.projects);

            return (
              <Card key={a.id} className="relative">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm">{a.summary || "Approval requested"}</CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <span>Project: {project?.name || "Unknown project"}</span>
                        <span>Agent: {agent?.name || "Unknown agent"}</span>
                        <span>Execution job: {job?.title || "Unknown job"}</span>
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {a.severity ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-700">{a.severity}</span> : null}
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700">{timeAgo(a.created_at)}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
                    <span>Requester: {a.requester_name || "Unknown requester"}</span>
                    <span>Execution status: {formatStatus(job?.status)}</span>
                  </div>

                  {a.project_id ? (
                    <Link href={`/projects/${a.project_id}`} className="inline-flex text-xs font-medium text-red-600 hover:underline">
                      Open project →
                    </Link>
                  ) : null}

                  <form action={handleApproval} id={`form-${a.id}`} className="space-y-3">
                    <input type="hidden" name="id" value={a.id} />
                    <textarea
                      name="note"
                      placeholder="Decision note (required for Request Changes)"
                      className="w-full rounded-md border border-zinc-200 bg-white p-2 text-sm focus:border-zinc-400 focus:outline-none"
                      rows={3}
                    />
                  </form>
                </CardContent>
                <CardFooter
                  data-testid="sticky-action-bar"
                  className="sticky bottom-16 z-40 flex gap-2 bg-white/95 backdrop-blur md:static md:bg-transparent md:backdrop-blur-none"
                >
                  <Button
                    type="submit"
                    form={`form-${a.id}`}
                    name="decision"
                    value="approve"
                    variant="default"
                    className="flex-1 bg-red-600 text-white hover:bg-red-700"
                  >
                    Approve
                  </Button>
                  <Button
                    type="submit"
                    form={`form-${a.id}`}
                    name="decision"
                    value="changes_requested"
                    variant="secondary"
                    className="flex-1 bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                  >
                    Request Changes
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Audit Trail</h2>
        {resolved.length === 0 && <p className="text-sm text-zinc-500">No resolved approvals yet.</p>}
        <div className="space-y-3">
          {resolved.map((a) => {
            const agent = getJoinedRow(a.agents);
            const project = getJoinedRow(a.projects);

            return (
              <div key={a.id} className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.status === "approved"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {formatStatus(a.status)}
                    </span>
                    <p className="mt-1 font-medium text-zinc-900">{a.summary || "Approval requested"}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {project?.name || "Unknown project"}
                      {agent?.name ? ` • ${agent.name}` : ""}
                    </p>
                    {a.note && <p className="mt-1 text-xs italic text-zinc-500">Note: {a.note}</p>}
                  </div>
                  <span className="whitespace-nowrap text-xs text-zinc-400">
                    {a.decided_at ? new Date(a.decided_at).toLocaleString() : "Not available"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

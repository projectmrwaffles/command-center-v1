import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MessageSquareMore,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { createServerClient } from "@/lib/supabase-server";
import { ErrorState } from "@/components/error-state";
import { DbBanner } from "@/components/db-banner";
import { Button } from "@/components/ui/button";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { PageHero, PageHeroStat } from "@/components/ui/page-hero";
import { getProjectLinkEntries, type ProjectLinks } from "@/lib/project-links";
import { formatCheckpointTypeLabel, getCheckpointEvidenceRequirements } from "@/lib/milestone-review";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ApprovalArtifact = {
  kind: "workspace_file" | "git_commit";
  label: string;
  value: string;
  sourceTaskId?: string;
  sourceTaskTitle?: string;
};

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
  sprint_id: string | null;
  approval_type?: string | null;
  context?: { links?: ProjectLinks | null; sprint_name?: string | null; note?: string | null; checkpointType?: string | null; approvalType?: string | null; evidenceRequirements?: Record<string, unknown> | null; artifacts?: ApprovalArtifact[] | null } | null;
  projects?: { name: string | null; links?: ProjectLinks | null } | { name: string | null; links?: ProjectLinks | null }[] | null;
  sprints?: { name: string | null } | { name: string | null }[] | null;
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

function formatTimestamp(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

function severityTone(severity?: string | null) {
  switch ((severity || "").toLowerCase()) {
    case "high":
    case "critical":
      return "border-red-200 bg-red-50 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-zinc-200 bg-white text-zinc-700";
  }
}

function decisionTone(status?: string | null) {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "changes_requested":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
  }
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
    .select("id, project_id, job_id, agent_id, summary, status, sprint_id")
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

  if (existingApproval?.sprint_id) {
    await db
      .from("sprints")
      .update({
        approval_gate_status: decision === "approve" ? "approved" : "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingApproval.sprint_id);
  }

  if (existingApproval?.project_id) {
    await db.from("agent_events").insert({
      agent_id: existingApproval.agent_id,
      project_id: existingApproval.project_id,
      job_id: existingApproval.job_id,
      event_type: "approval_decided",
      payload: {
        approval_id: id,
        sprint_id: existingApproval.sprint_id,
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
  searchParams: Promise<{ error?: string; approval?: string }>;
}) {
  const sp = await searchParams;
  const selectedApprovalId = sp.approval || null;
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
      .select("id, status, summary, note, decided_at, agent_id, job_id, project_id, severity, requester_name, created_at, sprint_id, approval_type, context, agents(name, title), jobs(title, status), projects(name, links), sprints(name)")
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
  const approvedCount = resolved.filter((a) => a.status === "approved").length;
  const changesRequestedCount = resolved.filter((a) => a.status === "changes_requested").length;

  return (
    <div className="space-y-6 md:space-y-8">
      <DbBanner />

      <PageHero>
        <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div className="max-w-3xl space-y-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Approvals</h1>
              <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
                Review decisions that need approval, see recent outcomes, and keep the audit trail clear.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <PageHeroStat className="border-red-100">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-red-700">
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                  Needs attention
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{pending.length}</div>
              </PageHeroStat>
              <PageHeroStat className="border-emerald-100">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Approved
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{approvedCount}</div>
              </PageHeroStat>
              <PageHeroStat className="border-amber-100">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-amber-700">
                  <MessageSquareMore className="h-4 w-4 text-amber-500" />
                  Changes requested
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{changesRequestedCount}</div>
              </PageHeroStat>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[280px] lg:max-w-sm">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-medium text-zinc-900">Approval queue</div>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                Approve to move work forward, or request changes with a note so the team knows what to fix.
              </p>
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                {pending.length > 0
                  ? `${pending.length} item${pending.length === 1 ? " is" : "s are"} waiting for operator action right now.`
                  : "The queue is clear. Resolved approvals remain below as the audit trail."}
              </div>
            </div>
          </div>
        </div>
      </PageHero>

      {sp.error === "note_required" && (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
          Note is required when requesting changes.
        </div>
      )}

      {sp.error === "db_not_initialized" && (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700 shadow-sm">
          Database not initialized. Apply migrations first.
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">Pending approvals</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">Act on live requests while keeping all existing project links, notes, and decision actions intact.</p>
          </div>
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-700">
            {pending.length} open
          </span>
        </div>

        {pending.length === 0 ? (
          <BrandedEmptyState
            icon={<BadgeCheck className="h-8 w-8 text-red-600" />}
            title="No pending approvals"
            description="The queue is clear. When agents or operators need a trust gate, those requests will land here with project and execution context attached."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {pending.map((a) => {
              const agent = getJoinedRow(a.agents);
              const job = getJoinedRow(a.jobs);
              const project = getJoinedRow(a.projects);
              const sprint = getJoinedRow(a.sprints);
              const reviewLinks = getProjectLinkEntries(a.context?.links || project?.links || null);
              const approvalType = a.approval_type || a.context?.approvalType || a.context?.checkpointType || null;
              const evidenceRequirements = getCheckpointEvidenceRequirements(approvalType, a.context?.evidenceRequirements);

              return (
                <Card
                  key={a.id}
                  id={`approval-${a.id}`}
                  variant="featured"
                  className={cn(
                    "relative scroll-mt-24 overflow-hidden rounded-[24px] transition-shadow",
                    selectedApprovalId === a.id ? "border-red-300 shadow-[0_0_0_2px_rgba(220,38,38,0.14)]" : undefined,
                  )}
                >
                  <CardContent className="flex h-full flex-col gap-5 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {a.severity ? (
                            <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]", severityTone(a.severity))}>
                              {a.severity}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                            Pending
                          </span>
                          {approvalType ? (
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-700">
                              {formatCheckpointTypeLabel(approvalType)}
                            </span>
                          ) : null}
                          {evidenceRequirements.screenshotRequired ? (
                            <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-purple-700">
                              Screenshot evidence required
                            </span>
                          ) : null}
                        </div>

                        <div>
                          <h3 className="text-lg font-semibold tracking-tight text-zinc-950">{a.summary || "Approval requested"}</h3>
                          <p className="mt-2 text-sm leading-6 text-zinc-600">
                            Review the attached delivery context, add an optional decision note, and send the job forward or back for changes.
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                          {selectedApprovalId === a.id ? <Sparkles className="h-3.5 w-3.5 text-red-500" /> : <Clock3 className="h-3.5 w-3.5" />}
                          {selectedApprovalId === a.id ? "Opened from project" : "Submitted"}
                        </div>
                        <div className="mt-1 text-sm font-medium text-zinc-900">{selectedApprovalId === a.id ? "Linked request" : timeAgo(a.created_at)}</div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Project</div>
                        <div className="mt-1 text-sm font-medium text-zinc-900">{project?.name || "Unknown project"}</div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Milestone</div>
                        <div className="mt-1 text-sm font-medium text-zinc-900">{a.context?.sprint_name || sprint?.name || "Project review"}</div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Agent</div>
                        <div className="mt-1 text-sm font-medium text-zinc-900">{agent?.name || "Unknown agent"}</div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Execution job</div>
                        <div className="mt-1 text-sm font-medium text-zinc-900">{job?.title || "Unknown job"}</div>
                        <div className="mt-1 text-xs capitalize text-zinc-500">{formatStatus(job?.status)}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Requester</div>
                          <div className="mt-1 text-sm text-zinc-700">{a.requester_name || "Unknown requester"}</div>
                        </div>
                        {a.project_id ? (
                          <Link href={`/projects/${a.project_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-red-700 transition hover:text-red-800">
                            Open project
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        ) : null}
                      </div>
                      {a.context?.note ? (
                        <div>
                          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Review note</div>
                          <p className="mt-1 text-sm leading-6 text-zinc-600">{a.context.note}</p>
                        </div>
                      ) : null}
                      {evidenceRequirements.screenshotRequired ? (
                        <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm leading-6 text-purple-950">
                          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-purple-700">Evidence requirement</div>
                          <p className="mt-1">{evidenceRequirements.captureHint || `Attach at least ${evidenceRequirements.minScreenshotCount} screenshot${evidenceRequirements.minScreenshotCount === 1 ? "" : "s"} from the local app capture flow before approving this checkpoint.`}</p>
                        </div>
                      ) : null}
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Artifact links</div>
                        {reviewLinks.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {reviewLinks.map((link) => (
                              <a key={link.key} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 hover:border-red-200 hover:text-red-700">
                                {link.label}
                                <ArrowRight className="h-3.5 w-3.5" />
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-zinc-500">No external artifact links attached.</p>
                        )}
                      </div>
                      {Array.isArray(a.context?.artifacts) && a.context.artifacts.length > 0 ? (
                        <div>
                          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Attached review artifacts</div>
                          <div className="mt-2 space-y-2">
                            {a.context.artifacts.map((artifact: any) => (
                              <div key={`${artifact.kind}-${artifact.value}`} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                                <div className="font-medium text-zinc-900">{artifact.label}</div>
                                <div className="mt-1 break-all">{artifact.value}</div>
                                {artifact.sourceTaskTitle ? <div className="mt-1 text-[11px] text-zinc-500">From {artifact.sourceTaskTitle}</div> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <form action={handleApproval} id={`form-${a.id}`} className="mt-auto space-y-4">
                      <input type="hidden" name="id" value={a.id} />
                      <div>
                        <label htmlFor={`note-${a.id}`} className="mb-2 block text-sm font-medium text-zinc-900">
                          Decision note
                        </label>
                        <textarea
                          id={`note-${a.id}`}
                          name="note"
                          placeholder="Add context for the decision. Required when requesting changes / rejecting with comment."
                          className="min-h-28 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
                          rows={4}
                        />
                      </div>
                    </form>

                    <div
                      data-testid="sticky-action-bar"
                      className="sticky bottom-16 z-40 flex flex-col gap-2 border-t border-zinc-100 bg-white pt-4 md:static md:border-0 md:bg-transparent md:p-0 lg:flex-row"
                    >
                      <Button
                        type="submit"
                        form={`form-${a.id}`}
                        name="decision"
                        value="approve"
                        size="lg"
                        variant="warm"
                        className="flex-1 rounded-xl"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        type="submit"
                        form={`form-${a.id}`}
                        name="decision"
                        value="changes_requested"
                        size="lg"
                        variant="outline"
                        className="flex-1 rounded-xl border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      >
                        <AlertTriangle className="h-4 w-4" />
                        Reject with comment
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">Audit trail</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">Resolved decisions stay readable here with the original summary, related project, and any operator note.</p>
          </div>
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            {resolved.length} resolved
          </span>
        </div>

        {resolved.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-sm text-zinc-500">
            No resolved approvals yet.
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {resolved.map((a) => {
              const agent = getJoinedRow(a.agents);
              const project = getJoinedRow(a.projects);

              return (
                <div key={a.id} className="rounded-[24px] border border-zinc-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]", decisionTone(a.status))}>
                          {formatStatus(a.status)}
                        </span>
                        {a.severity ? (
                          <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]", severityTone(a.severity))}>
                            {a.severity}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-base font-semibold tracking-tight text-zinc-950">{a.summary || "Approval requested"}</p>
                      <div className="mt-3 grid gap-2 text-sm text-zinc-500 sm:grid-cols-2">
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Project</div>
                          <div className="mt-1 text-zinc-700">{project?.name || "Unknown project"}</div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Agent</div>
                          <div className="mt-1 text-zinc-700">{agent?.name || "Unknown agent"}</div>
                        </div>
                      </div>
                      {a.note ? (
                        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-600">
                          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Decision note</div>
                          <p className="mt-1 whitespace-pre-wrap">{a.note}</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-right text-xs text-zinc-500">
                      <div className="flex items-center justify-end gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                        <ClipboardList className="h-3.5 w-3.5" />
                        Decided
                      </div>
                      <div className="mt-1 max-w-[160px] text-wrap text-zinc-700">{formatTimestamp(a.decided_at)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

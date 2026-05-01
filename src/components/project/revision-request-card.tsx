"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProofItem = {
  id: string;
  kind: string;
  label: string;
  url: string | null;
  storagePath: string | null;
  notes: string | null;
  metadata?: Record<string, unknown> | null;
};

type ReviewArtifact = {
  kind: "preview_url" | "workspace_file" | "git_commit";
  label: string;
  value: string;
  sourceTaskId?: string;
  sourceTaskTitle?: string;
};

type ReviewSummary = {
  latestSubmissionId: string | null;
  latestSubmissionSummary: string | null;
  latestDecisionNotes: string | null;
  latestSubmittedAt: string | null;
  proofItemCount: number;
  proofItems?: ProofItem[];
};

type RevisionDecisionState = {
  key: "decision_needed" | "needs_revision" | "approved_for_implementation" | "implemented";
  label: string;
  className: string;
  description: string;
};

type CandidateOption = {
  id: string;
  label: string;
  href: string | null;
  sublabel: string;
};

type ActionMode = "select_direction" | "request_another_pass" | "approve_for_implementation" | null;

function formatRelative(value?: string | null) {
  if (!value) return "Recently updated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ModalShell({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-[24px] bg-panel p-6 shadow-[var(--shadow-panel)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-text">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
          </div>
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>Close</Button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export function RevisionRequestCard({
  projectId,
  sprintId,
  sprintName,
  reviewSummary,
  reviewArtifacts,
  decisionState,
  onSubmitted,
}: {
  projectId: string;
  sprintId: string;
  sprintName: string;
  reviewSummary: ReviewSummary;
  reviewArtifacts: ReviewArtifact[];
  decisionState: RevisionDecisionState;
  onSubmitted?: () => void;
}) {
  const [mode, setMode] = useState<ActionMode>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [notes, setNotes] = useState("");
  const [requiresAnotherPass, setRequiresAnotherPass] = useState(false);
  const [savingMode, setSavingMode] = useState<ActionMode>(null);
  const [status, setStatus] = useState<string | null>(null);

  const candidateOptions = useMemo<CandidateOption[]>(() => {
    const proofCandidates = (reviewSummary.proofItems || []).map((item) => ({
      id: item.id,
      label: item.label,
      href: item.url || item.storagePath || null,
      sublabel: item.kind.replace(/_/g, " "),
    }));

    if (proofCandidates.length > 0) return proofCandidates;

    return reviewArtifacts.map((item, index) => ({
      id: `${item.kind}-${index}`,
      label: item.label,
      href: item.value,
      sublabel: item.kind.replace(/_/g, " "),
    }));
  }, [reviewArtifacts, reviewSummary.proofItems]);

  const artifactLinks = useMemo(() => {
    const links = candidateOptions.filter((item) => Boolean(item.href));
    return links.slice(0, 4);
  }, [candidateOptions]);

  const candidateCount = candidateOptions.length || reviewSummary.proofItemCount || reviewArtifacts.length;

  const resetForm = () => {
    setMode(null);
    setSelectedCandidateId("");
    setNotes("");
    setRequiresAnotherPass(false);
  };

  const submit = async () => {
    if (!mode) return;
    if (mode === "request_another_pass" && !notes.trim()) {
      setStatus("Add notes before requesting another pass.");
      return;
    }

    setSavingMode(mode);
    setStatus(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/revision-decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          sprintId,
          submissionId: reviewSummary.latestSubmissionId,
          selectedCandidateId: selectedCandidateId || null,
          notes: notes.trim() || null,
          requiresAnotherPass,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to record revision decision");
      setStatus(mode === "request_another_pass" ? "Another pass requested" : mode === "approve_for_implementation" ? "Approved for implementation" : "Direction selected");
      resetForm();
      onSubmitted?.();
    } catch (error: any) {
      setStatus(error?.message || "Failed to record revision decision");
    } finally {
      setSavingMode(null);
    }
  };

  const renderCandidateSelector = () => (
    <div className="space-y-2">
      <div className="text-sm font-medium text-text-secondary">Choose a candidate {candidateOptions.length > 0 ? "(optional)" : ""}</div>
      {candidateOptions.length > 0 ? (
        candidateOptions.map((candidate) => {
          const checked = selectedCandidateId === candidate.id;
          return (
            <label key={candidate.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm", checked ? "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40" : "border-border bg-panel-elevated")}>
              <input type="radio" checked={checked} onChange={() => setSelectedCandidateId(candidate.id)} className="mt-1" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-text">{candidate.label}</div>
                <div className="text-xs text-text-muted">{candidate.sublabel}</div>
              </div>
              {candidate.href ? (
                <a href={candidate.href} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-red-600 hover:text-red-700">
                  Open
                </a>
              ) : null}
            </label>
          );
        })
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-panel-elevated px-3 py-4 text-sm text-text-muted">No candidate links were materialized for this submission yet. You can still save and use notes to describe the direction.</div>
      )}
    </div>
  );

  return (
    <>
      <div className="rounded-[24px] border border-border bg-panel p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-panel-elevated px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary">Revision decision</span>
              <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", decisionState.className)}>{decisionState.label}</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-text">{sprintName}</h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{reviewSummary.latestSubmissionSummary || decisionState.description}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-text-muted">
              <span>{candidateCount} candidate{candidateCount === 1 ? "" : "s"}</span>
              <span>•</span>
              <span>{formatRelative(reviewSummary.latestSubmittedAt)}</span>
            </div>
            {reviewSummary.latestDecisionNotes ? (
              <div className="rounded-2xl border border-border bg-panel-elevated px-4 py-3 text-sm text-text-secondary">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Latest decision notes</div>
                <p className="mt-2 whitespace-pre-wrap leading-6">{reviewSummary.latestDecisionNotes}</p>
              </div>
            ) : null}
          </div>

          <div className="w-full max-w-sm space-y-3">
            <div className="rounded-2xl border border-border bg-panel-elevated p-4">
              <div className="text-sm font-medium text-text">Artifacts</div>
              {artifactLinks.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {artifactLinks.map((link) => (
                    <a key={link.id} href={link.href || undefined} target={link.href ? "_blank" : undefined} rel={link.href ? "noreferrer" : undefined} className="flex items-center justify-between rounded-xl border border-border bg-panel px-3 py-3 text-sm transition hover:border-accent/25">
                      <div>
                        <div className="font-medium text-text">{link.label}</div>
                        <div className="text-xs text-text-muted">{link.sublabel}</div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-red-600" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-text-muted">No view links were materialized for this review set yet.</p>
              )}
            </div>

            <div className="grid gap-2">
              <Button type="button" className="w-full rounded-xl justify-center" disabled={!!savingMode} onClick={() => setMode("select_direction")}>
                Select Direction
              </Button>
              <Button type="button" variant="outline" className="w-full rounded-xl justify-center" disabled={!!savingMode} onClick={() => setMode("request_another_pass")}>
                Request Another Pass
              </Button>
              <Button type="button" variant="ghost" className="w-full rounded-xl justify-center text-text" disabled={!!savingMode} onClick={() => setMode("approve_for_implementation")}>
                Approve for Implementation
              </Button>
            </div>
            {status ? <p className={cn("text-xs", /failed|required|choose|add/i.test(status) ? "text-red-600" : "text-emerald-600")}>{status}</p> : null}
          </div>
        </div>
      </div>

      {mode === "select_direction" ? (
        <ModalShell title="Select Direction" description="Choose the direction to anchor the next move. This records the direction without creating a new revision request." onClose={resetForm}>
          <div className="space-y-4">
            {renderCandidateSelector()}
            <div>
              <label className="block text-sm font-medium text-text-secondary">Notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="Capture what to keep, combine, or sharpen for the next step..." className="mt-1 w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text focus:border-red-500 focus:outline-none" />
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-panel-elevated px-3 py-3 text-sm">
              <input type="checkbox" checked={requiresAnotherPass} onChange={(e) => setRequiresAnotherPass(e.target.checked)} className="mt-1" />
              <div>
                <div className="font-medium text-text">Requires another design pass before implementation</div>
                <div className="mt-1 text-text-muted">Use this when you want to pick a base direction now but send the work back for another pass.</div>
              </div>
            </label>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={resetForm}>Cancel</Button>
              <Button type="button" className="rounded-xl" disabled={savingMode === mode} onClick={submit}>{savingMode === mode ? "Saving..." : "Save direction"}</Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {mode === "request_another_pass" ? (
        <ModalShell title="Request Another Pass" description="Keep the same revision lineage, send clear notes back to design, and reopen the existing flow." onClose={resetForm}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary">What needs to change</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Be explicit about what should change in the next pass..." className="mt-1 w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text focus:border-red-500 focus:outline-none" />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={resetForm}>Cancel</Button>
              <Button type="button" className="rounded-xl" disabled={savingMode === mode} onClick={submit}>{savingMode === mode ? "Submitting..." : "Request another pass"}</Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {mode === "approve_for_implementation" ? (
        <ModalShell title="Approve for Implementation" description="Mark this direction as final for build and move this milestone toward implementation." onClose={resetForm}>
          <div className="space-y-4">
            {renderCandidateSelector()}
            <div>
              <label className="block text-sm font-medium text-text-secondary">Implementation notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="Call out handoff details the implementation owner should keep in mind..." className="mt-1 w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text focus:border-red-500 focus:outline-none" />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={resetForm}>Cancel</Button>
              <Button type="button" className="rounded-xl" disabled={savingMode === mode} onClick={submit}>{savingMode === mode ? "Approving..." : "Approve for implementation"}</Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}

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

function getMotionCopy(state: RevisionDecisionState) {
  switch (state.key) {
    case "needs_revision":
      return {
        title: "Currently with the team",
        body: "Your latest direction has been saved and this revision is back in motion with the team now.",
      };
    case "approved_for_implementation":
      return {
        title: "Implementation unlocked",
        body: "This revision was accepted and the workflow can now move forward into implementation and commit-ready execution.",
      };
    case "implemented":
      return {
        title: "Already implemented",
        body: "This approved direction has already been carried through implementation.",
      };
    default:
      return {
        title: "Decision needed",
        body: "Choose whether to start implementation now or send it back for another design pass.",
      };
  }
}

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

type ActionMode = "approve_and_implement" | "request_another_pass" | null;

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
  const [notes, setNotes] = useState("");
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

  const artifactCount = candidateOptions.length || reviewSummary.proofItemCount || reviewArtifacts.length;
  const motionCopy = getMotionCopy(decisionState);

  const resetForm = () => {
    setMode(null);
    setNotes("");
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
          action: mode === "approve_and_implement"
            ? "approve_for_implementation"
            : mode,
          sprintId,
          submissionId: reviewSummary.latestSubmissionId,
          notes: notes.trim() || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to record revision decision");
      setStatus(
        mode === "request_another_pass"
          ? "Another pass requested"
          : "Approved and moved into implementation",
      );
      resetForm();
      onSubmitted?.();
    } catch (error: any) {
      setStatus(error?.message || "Failed to record revision decision");
    } finally {
      setSavingMode(null);
    }
  };

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
              <span>{artifactCount} submitted artifact{artifactCount === 1 ? "" : "s"}</span>
              <span>•</span>
              <span>{formatRelative(reviewSummary.latestSubmittedAt)}</span>
            </div>
            <div className="rounded-2xl border border-border bg-panel-elevated px-4 py-3 text-sm text-text-secondary">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{motionCopy.title}</div>
              <p className="mt-2 leading-6">{motionCopy.body}</p>
            </div>
            {reviewSummary.latestDecisionNotes ? (
              <div className="rounded-2xl border border-border bg-panel-elevated px-4 py-3 text-sm text-text-secondary">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Last direction sent to team</div>
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

            <div className="rounded-2xl border border-border bg-panel-elevated p-4 text-sm text-text-secondary">
              <div className="font-medium text-text">What happens next</div>
              <p className="mt-2 leading-6">Approve and start implementation is the default forward path here. It keeps the artifact page read-only, saves your notes, and moves this accepted revision into implementation/commit flow. If the design still needs work, use the secondary path to send it back for another pass.</p>
            </div>

            <div className="grid gap-2">
              <Button type="button" className="w-full rounded-xl justify-center" disabled={!!savingMode} onClick={() => setMode("approve_and_implement")}>
                Approve and Start Implementation
              </Button>
              <Button type="button" variant="outline" className="w-full rounded-xl justify-center" disabled={!!savingMode} onClick={() => setMode("request_another_pass")}>
                Needs More Design Work
              </Button>
            </div>
            {status ? <p className={cn("text-xs", /failed|required|choose|add/i.test(status) ? "text-red-600" : "text-emerald-600")}>{status}</p> : null}
          </div>
        </div>
      </div>

      {mode === "approve_and_implement" ? (
        <ModalShell title="Approve and Start Implementation" description="We’ll keep the artifact page read-only, save your notes, and move this accepted revision into implementation/commit flow. No candidate selection needed." onClose={resetForm}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary">Implementation notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="Call out anything the implementation owner should preserve while building and committing this revision..." className="mt-1 w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text focus:border-red-500 focus:outline-none" />
            </div>
            <div className="rounded-xl border border-border bg-panel-elevated px-4 py-3 text-sm text-text-secondary">
              Pressing continue keeps the artifact page read-only, saves your notes, and advances this accepted revision into implementation/commit flow.
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={resetForm}>Cancel</Button>
              <Button type="button" className="rounded-xl" disabled={savingMode === mode} onClick={submit}>{savingMode === mode ? "Saving..." : "Approve and start implementation"}</Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {mode === "request_another_pass" ? (
        <ModalShell title="Needs More Design Work" description="Send clear change notes back to design and reopen this revision flow for another round." onClose={resetForm}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary">What needs to change</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Be explicit about what should change in the next pass..." className="mt-1 w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm text-text focus:border-red-500 focus:outline-none" />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={resetForm}>Cancel</Button>
              <Button type="button" className="rounded-xl" disabled={savingMode === mode} onClick={submit}>{savingMode === mode ? "Submitting..." : "Send back for another design pass"}</Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

    </>
  );
}

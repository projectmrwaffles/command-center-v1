"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Sparkles, X } from "lucide-react";
import { CreateProjectForm } from "@/components/create-project-form";
import { Button } from "@/components/ui/button";
import { PageHero, PageHeroStat } from "@/components/ui/page-hero";
import { useCreateProject } from "@/hooks/use-create-project";

type CreatedProject = {
  id: string;
  name?: string;
  type?: string;
  dispatch?: {
    attempted?: number;
    dispatched?: number;
    blocked?: number;
  } | null;
};

const PROJECT_CREATE_HANDOFF_KEY = "project-create-handoff";

function writeProjectCreateHandoff(project: CreatedProject, source: "intake-modal") {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    PROJECT_CREATE_HANDOFF_KEY,
    JSON.stringify({
      projectId: project.id,
      createdAt: new Date().toISOString(),
      source,
    })
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();

    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

function storageNotConfiguredMessage() {
  return "Storage not configured: create bucket project_docs (private). Supabase Dashboard → Storage → New bucket → name: project_docs → set Private.";
}

function SuccessState({
  project,
  docsWarning,
  docsProgress,
  onOpenProject,
}: {
  project: CreatedProject;
  docsWarning?: string | null;
  docsProgress?: number | null;
  onOpenProject: () => void;
}) {
  const dispatch = project.dispatch || null;
  const dispatchAttempted = dispatch?.attempted || 0;
  const dispatchStarted = dispatch?.dispatched || 0;
  const dispatchBlocked = dispatch?.blocked || 0;
  const workflowSummary = dispatchStarted > 0
    ? "Kickoff was dispatched successfully. Open the workspace to track live execution."
    : dispatchAttempted > 0
      ? dispatchBlocked > 0
        ? "Project created. Kickoff still needs something before it can start. Open the workspace to review the current hold reason."
        : "Project created. Execution has not started yet. Open the workspace to confirm dispatch state."
      : "Project created. Open the workspace to review kickoff and execution state.";
  const statusTone = dispatchStarted > 0
    ? {
        dot: "bg-emerald-500",
        summary: workflowSummary,
      }
    : {
        dot: "bg-amber-500",
        summary: workflowSummary,
      };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHero className="border-emerald-100/80 bg-[radial-gradient(circle_at_top,rgba(220,252,231,0.9),rgba(255,255,255,0.98)_42%,rgba(240,253,250,0.95)_100%)] dark:border-emerald-900/40 dark:bg-[radial-gradient(circle_at_top,rgba(6,95,70,0.32),rgba(15,23,42,0.96)_42%,rgba(6,78,59,0.28)_100%)]">
        <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between lg:p-8">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-panel/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              Project handoff
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
                {dispatchStarted > 0 ? `${project.name || "Your project"} kickoff started.` : `${project.name || "Your project"} was created.`}
              </h2>
              <p className="max-w-xl text-sm leading-6 text-text-secondary sm:text-base">{statusTone.summary}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {dispatch ? <span className="rounded-full border border-border bg-panel px-3 py-1.5 text-text-secondary">dispatch attempted: {dispatchAttempted}</span> : null}
              {dispatch ? <span className="rounded-full border border-border bg-panel px-3 py-1.5 text-text-secondary">started: {dispatchStarted}</span> : null}
              {dispatchBlocked > 0 ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700">blocked: {dispatchBlocked}</span> : null}
            </div>
          </div>

          <div className="flex w-full max-w-sm flex-col gap-3">
            <PageHeroStat className="border-emerald-100 bg-panel/90 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${statusTone.dot}`} />
                Workspace ready
              </div>
              <div className="mt-3 text-sm leading-6 text-text-secondary">Success state stays here until you open the workspace.</div>
            </PageHeroStat>
            <Button type="button" onClick={onOpenProject} className="rounded-2xl px-4 py-3 text-sm font-semibold">
              Open workspace
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </PageHero>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-[28px] border border-border bg-panel p-5 shadow-[var(--shadow-panel)] sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-[var(--shadow-accent)]">
              <Check className="h-6 w-6" strokeWidth={2.4} />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">Project record created</p>
              <p className="text-sm text-text-muted">Routing, kickoff, and attachments preserved from the intake flow.</p>
            </div>
          </div>

          {docsWarning ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {docsWarning}
              {typeof docsProgress === "number" ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-100"><div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${docsProgress}%` }} /></div> : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-border bg-panel-elevated/80 p-5 shadow-[var(--shadow-panel-soft)] sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Next step</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-text">Jump into the workspace</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">Open the project to review kickoff state, current tasks, and any attachment-derived requirements.</p>
        </div>
      </div>
    </div>
  );
}

export function CreateProjectWorkspace({
  open = true,
  onOpenChange,
  prefillName,
  prefillType,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  prefillName?: string;
  prefillType?: string;
}) {
  const router = useRouter();
  const { isSubmitting, error, createProject, resetCreateProjectState } = useCreateProject();
  const mobile = useIsMobile();

  const [docs, setDocs] = useState<File[]>([]);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docsBusy, setDocsBusy] = useState(false);
  const [createdProject, setCreatedProject] = useState<CreatedProject | null>(null);
  const [docsWarning, setDocsWarning] = useState<string | null>(null);
  const [docsProgress, setDocsProgress] = useState<number | null>(null);
  const redirectTimeoutRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const isOpen = open;

  useEffect(() => {
    if (!isOpen || createdProject) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange?.(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createdProject, isOpen, onOpenChange]);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    resetCreateProjectState();
    setDocs([]);
    setDocsError(null);
    setDocsBusy(false);
    setCreatedProject(null);
    setDocsWarning(null);
    setDocsProgress(null);
    if (redirectTimeoutRef.current) {
      window.clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [isOpen, resetCreateProjectState]);

  useLayoutEffect(() => {
    if (!createdProject) return;
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [createdProject]);

  const scrollContentToTop = () => {
    const container = contentRef.current;
    if (!container) return;
    container.scrollTo({ top: 0, behavior: "auto" });
  };

  const handleClose = () => {
    onOpenChange?.(false);
  };

  const navigateToProject = (project: CreatedProject) => {
    if (redirectTimeoutRef.current) {
      window.clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    writeProjectCreateHandoff(project, "intake-modal");
    router.push(`/projects/${project.id}?created=1`);
  };

  async function uploadProjectDocs(projectId: string) {
    const progressTimers: number[] = [];
    if (docs.length === 0) return { ok: true } as const;

    setDocsBusy(true);
    setDocsError(null);
    setDocsWarning(`Upload received. Processing ${docs.length} attachment${docs.length === 1 ? "" : "s"}...`);
    setDocsProgress(18);
    progressTimers.push(window.setTimeout(() => { setDocsWarning("Extracting PRD text and image notes..."); setDocsProgress(42); }, 350));
    progressTimers.push(window.setTimeout(() => { setDocsWarning("Deriving requirements from attached materials..."); setDocsProgress(64); }, 1100));
    progressTimers.push(window.setTimeout(() => { setDocsWarning("Seeding kickoff from extracted requirements..."); setDocsProgress(84); }, 2200));

    try {
      const formData = new FormData();
      for (const file of docs) {
        formData.append("files", file, file.name);
      }

      const res = await fetch(`/api/projects/${projectId}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("[documents upload] failed", payload);
        return { ok: false, message: payload.error || storageNotConfiguredMessage() } as const;
      }

      const docSourceCount = Array.isArray(payload?.requirements?.sources)
        ? payload.requirements.sources.filter((source: { type?: string | null }) => source?.type !== "intake").length
        : 0;

      const extractedEvidenceCount = Array.isArray(payload?.requirements?.summary)
        ? payload.requirements.summary.length
        : 0;

      return {
        ok: true,
        attachmentKickoffState: payload?.attachmentKickoffState || null,
        ingestionSummary:
          docSourceCount > 0
            ? `Read ${docSourceCount} attached file${docSourceCount === 1 ? "" : "s"} into project requirements${extractedEvidenceCount > 0 ? ` (${extractedEvidenceCount} evidence item${extractedEvidenceCount === 1 ? "" : "s"})` : ""}.`
            : null,
      } as const;
    } finally {
      progressTimers.forEach((timer) => window.clearTimeout(timer));
      setDocsBusy(false);
    }
  }

  const reviewAttachments = docs.map((file) => ({
    name: file.name,
    sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
  }));

  const docsSection = (
    <div className="overflow-hidden rounded-[28px] border border-accent/15 bg-panel p-4 shadow-[var(--shadow-panel-soft)] sm:p-5">
      <div className="ds-accent-badge inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] shadow-sm">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        Supporting materials
      </div>
      <div className="mb-2 mt-4 text-sm font-semibold text-text">Supporting docs and images</div>
      <p className="mb-3 text-xs leading-5 text-text-muted">Attach PRDs, screenshots, or reference images. They upload after project creation and stay private in project_docs.</p>

      {docsError && (
        <div className="ds-warning mb-3 rounded-md px-3 py-2 text-sm">
          {docsError}
        </div>
      )}

      <input
        type="file"
        multiple
        accept="application/pdf,image/*"
        onChange={(e) => setDocs(Array.from(e.target.files ?? []))}
        className="block w-full rounded-2xl border border-dashed border-accent/25 bg-panel px-4 py-3 text-sm shadow-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-accent-soft-foreground hover:border-accent/40"
      />

      {docs.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-text-secondary">
          {docs.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-3">
              <span className="truncate">{f.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-text-muted">{Math.round(f.size / 1024)}KB</span>
                <button
                  type="button"
                  onClick={() => setDocs((current) => current.filter((doc) => !(doc.name === f.name && doc.size === f.size && doc.lastModified === f.lastModified)))}
                  className="rounded px-2 py-0.5 text-[11px] text-text-muted hover:bg-panel-elevated"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const formContent = createdProject ? (
    <SuccessState
      project={createdProject}
      docsWarning={docsWarning}
      docsProgress={docsProgress}
      onOpenProject={() => navigateToProject(createdProject)}
    />
  ) : (
    <CreateProjectForm
      prefillName={prefillName}
      prefillType={prefillType}
      docsSection={docsSection}
      reviewAttachments={reviewAttachments}
      onStepChange={scrollContentToTop}
      onSubmit={async (data) => {
        const project = await createProject({ ...data, hasAttachments: docs.length > 0 });

        setCreatedProject(project);
        setDocsWarning(docs.length > 0 ? "Upload received. Processing attached files..." : null);
        setDocsProgress(docs.length > 0 ? 12 : null);

        const docsResult = await uploadProjectDocs(project.id);
        if (!docsResult.ok && docs.length > 0) {
          setDocsWarning(docsResult.message || "Project created, but attached documents still need to be uploaded.");
          setDocsProgress(null);
          return;
        }

        setDocsWarning(docsResult.ingestionSummary || docsResult.attachmentKickoffState?.detail || null);
        setDocsProgress(docsResult.attachmentKickoffState?.progressPct || 100);
        redirectTimeoutRef.current = window.setTimeout(() => {
          navigateToProject(project);
        }, 1200);
      }}
      onCancel={handleClose}
      isSubmitting={isSubmitting || docsBusy}
      error={error}
    />
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[rgba(15,23,42,0.38)] backdrop-blur-[4px]" onClick={() => !createdProject && onOpenChange?.(false)} />

      <div className={mobile ? undefined : "fixed inset-0 flex items-center justify-center px-6 py-6 xl:px-8"}>
        <div
          className={
            mobile
              ? "fixed inset-x-0 bottom-0 flex max-h-[92dvh] min-w-0 flex-col overflow-hidden rounded-t-[32px] border border-white/20 bg-panel shadow-[0_-14px_40px_rgba(24,24,27,0.2)]"
              : "flex max-h-[calc(100dvh-48px)] w-full max-w-[980px] min-w-0 flex-col overflow-hidden rounded-[32px] border border-accent/15 bg-panel shadow-[0_24px_72px_rgba(15,23,42,0.18)] xl:max-w-[1020px]"
          }
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative shrink-0 overflow-hidden border-b border-accent/15 bg-panel px-4 py-4 sm:px-6 sm:py-5">
            <div className="absolute inset-x-0 bottom-0 h-px bg-accent/10" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight text-text sm:text-[1.75rem]">
                  {createdProject ? "Project ready" : "New project"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                  {createdProject
                    ? "Review the handoff card or jump straight into the workspace."
                    : "Add the essentials, attach anything helpful, and create the project when you&apos;re ready."}
                </p>
              </div>
              {!createdProject ? (
                <Button onClick={() => onOpenChange?.(false)} variant="outline" size="icon" className="rounded-2xl border-accent/15 bg-panel/90 text-text-secondary shadow-sm hover:bg-accent-soft/50" aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <div ref={contentRef} className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-panel px-3 py-3 pb-20 sm:px-6 sm:py-5">
            {formContent}
          </div>
        </div>
      </div>
    </div>
  );
}

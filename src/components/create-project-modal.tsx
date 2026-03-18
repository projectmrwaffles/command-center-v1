"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import { CreateProjectForm } from "@/components/create-project-form";
import { useCreateProject } from "@/hooks/use-create-project";
import { supabaseRealtime } from "@/lib/supabase-realtime";

type CreatedProject = {
  id: string;
  name?: string;
  type?: string;
};

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
  docsCount,
  redirecting,
  onOpenProject,
  onCreateAnother,
}: {
  project: CreatedProject;
  docsCount: number;
  redirecting: boolean;
  onOpenProject: () => void;
  onCreateAnother: () => void;
}) {
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 22 }, (_, index) => ({
        id: index,
        left: `${4 + ((index * 11) % 92)}%`,
        delay: `${(index % 11) * 95}ms`,
        duration: `${1900 + (index % 6) * 180}ms`,
        rotate: `${-18 + (index % 7) * 10}deg`,
        shape: index % 3 === 0 ? "rounded-sm" : index % 3 === 1 ? "rounded-full" : "rounded-[999px]",
        size: index % 4 === 0 ? "h-2.5 w-2.5" : index % 4 === 1 ? "h-3.5 w-2" : "h-3 w-1.5",
        color:
          [
            "bg-rose-400",
            "bg-amber-300",
            "bg-orange-300",
            "bg-fuchsia-300",
            "bg-zinc-900",
            "bg-emerald-300",
          ][index % 6],
      })),
    []
  );

  return (
    <div className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,237,213,0.95),rgba(255,255,255,0)_34%),radial-gradient(circle_at_20%_20%,rgba(251,207,232,0.28),rgba(255,255,255,0)_36%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,250,250,0.92))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 overflow-hidden">
        {confettiPieces.map((piece) => (
          <span
            key={piece.id}
            className={`celebration-confetti ${piece.color} ${piece.shape} ${piece.size}`}
            style={{
              left: piece.left,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
              transform: `rotate(${piece.rotate})`,
            }}
          />
        ))}
      </div>

      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="celebration-orb relative flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.98),rgba(255,255,255,0.28)_58%,rgba(255,255,255,0)_70%)]" />
          <div className="celebration-pulse relative z-10 flex h-18 w-18 items-center justify-center rounded-full bg-zinc-950 text-white shadow-[0_24px_60px_rgba(24,24,27,0.22)] sm:h-20 sm:w-20">
            <Check className="h-9 w-9 sm:h-10 sm:w-10" strokeWidth={2.2} />
          </div>
          <div className="celebration-star celebration-star-delay absolute left-2 top-3 rounded-full bg-white/90 p-1 text-rose-500 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="celebration-star absolute bottom-4 right-2 rounded-full bg-white/90 p-1 text-amber-500 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
        </div>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-rose-100 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-600 shadow-sm backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" />
          Project created
        </div>

        <h3 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          {project.name || "Your project"} is live and ready for the next move.
        </h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
          Everything landed cleanly{docsCount > 0 ? `, including ${docsCount} attached file${docsCount === 1 ? "" : "s"}` : ""}. We’ll take you to the project workspace in a moment so momentum stays intact.
        </p>

        <div className="mt-7 grid w-full gap-3 sm:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 text-left shadow-[0_18px_45px_rgba(24,24,27,0.08)] backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Launch sequence</p>
                <p className="mt-2 text-lg font-semibold text-zinc-950">Workspace handoff queued</p>
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                Ready
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-full bg-zinc-100">
              <div className={`redirect-progress h-2 rounded-full bg-[linear-gradient(90deg,#fb7185,#f59e0b,#18181b)] ${redirecting ? "is-active" : ""}`} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700">
                Intake saved
              </div>
              <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700">
                {docsCount > 0 ? `${docsCount} upload${docsCount === 1 ? "" : "s"} attached` : "No uploads attached"}
              </div>
              <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700">
                Next: project workspace
              </div>
            </div>
          </div>

          <div className="grid gap-3 text-left">
            <div className="rounded-[24px] border border-zinc-200/80 bg-white/80 px-4 py-4 shadow-sm backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Redirect</p>
              <p className="mt-2 text-sm font-medium text-zinc-900">
                {redirecting ? "Opening automatically now" : "Automatic redirect paused"}
              </p>
            </div>
            <div className="rounded-[24px] border border-zinc-200/80 bg-white/80 px-4 py-4 shadow-sm backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Project type</p>
              <p className="mt-2 text-sm font-medium text-zinc-900">{project.type || "General project"}</p>
            </div>
          </div>
        </div>

        <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onOpenProject}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-medium text-white shadow-[0_14px_30px_rgba(24,24,27,0.18)] transition hover:bg-zinc-800"
          >
            Open project now
            <ArrowUpRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCreateAnother}
            className="rounded-2xl border border-zinc-300 bg-white/90 px-5 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
          >
            Create another
          </button>
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          {redirecting ? "Redirecting automatically…" : "Redirect paused. You can open the project manually or start another."}
        </p>
      </div>
    </div>
  );
}

export function CreateProjectModal({
  open,
  onOpenChange,
  prefillName,
  prefillType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillName?: string;
  prefillType?: string;
}) {
  const router = useRouter();
  const { isSubmitting, error, createProject } = useCreateProject();
  const mobile = useIsMobile();

  const [docs, setDocs] = useState<File[]>([]);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docsBusy, setDocsBusy] = useState(false);
  const [createdProject, setCreatedProject] = useState<CreatedProject | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const redirectTimeoutRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || createdProject) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, createdProject]);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (open) {
      setDocs([]);
      setDocsError(null);
      setDocsBusy(false);
      setCreatedProject(null);
      setRedirecting(false);
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [open]);

  const scrollContentToTop = () => {
    const container = contentRef.current;
    if (!container) return;
    container.scrollTo({ top: 0, behavior: "smooth" });
  };

  const navigateToProject = (projectId: string) => {
    if (redirectTimeoutRef.current) {
      window.clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    setRedirecting(false);
    router.push(`/projects/${projectId}`);
  };

  const scheduleRedirect = (projectId: string) => {
    if (redirectTimeoutRef.current) {
      window.clearTimeout(redirectTimeoutRef.current);
    }
    setRedirecting(true);
    redirectTimeoutRef.current = window.setTimeout(() => {
      navigateToProject(projectId);
    }, 1800);
  };

  async function uploadProjectDocs(projectId: string) {
    if (docs.length === 0) return { ok: true } as const;
    if (!supabaseRealtime) {
      return { ok: false, message: "Supabase client not configured. Documents were not uploaded." } as const;
    }

    setDocsBusy(true);
    setDocsError(null);

    try {
      const uploaded: Array<{
        project_id: string;
        type: string;
        title: string;
        storage_path: string;
        mime_type: string | null;
        size_bytes: number;
      }> = [];

      for (const file of docs) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";
        const objectName = `${projectId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabaseRealtime.storage
          .from("project_docs")
          .upload(objectName, file, {
            contentType: file.type || undefined,
            upsert: false,
          });

        if (uploadError) {
          console.error("[Storage upload] error", uploadError);
          return { ok: false, message: storageNotConfiguredMessage() } as const;
        }

        uploaded.push({
          project_id: projectId,
          type: file.type === "application/pdf" ? "prd_pdf" : file.type.startsWith("image/") ? "image" : "other",
          title: file.name,
          storage_path: objectName,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
      }

      const res = await fetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents: uploaded }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        console.error("[documents insert] failed", payload);
        return { ok: false, message: payload.error || "Failed to save document metadata" } as const;
      }

      return { ok: true } as const;
    } finally {
      setDocsBusy(false);
    }
  }

  const docsSection = (
    <div className="rounded-[28px] border border-zinc-200 bg-white p-4 shadow-[0_12px_30px_rgba(24,24,27,0.04)]">
      <div className="mb-2 text-sm font-medium text-zinc-900">Supporting docs and images</div>
      <p className="mb-3 text-xs text-zinc-500">Attach PRDs, screenshots, or reference images. They upload after project creation and stay private in project_docs.</p>

      {docsError && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {docsError}
        </div>
      )}

      <input
        type="file"
        multiple
        accept="application/pdf,image/*"
        onChange={(e) => setDocs(Array.from(e.target.files ?? []))}
        className="block w-full text-sm"
      />

      {docs.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-zinc-600">
          {docs.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-3">
              <span className="truncate">{f.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">{Math.round(f.size / 1024)}KB</span>
                <button
                  type="button"
                  onClick={() => setDocs((current) => current.filter((doc) => !(doc.name === f.name && doc.size === f.size && doc.lastModified === f.lastModified)))}
                  className="rounded px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100"
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => !createdProject && onOpenChange(false)} />

      <div
        className={
          mobile
            ? "fixed inset-x-0 bottom-0 flex max-h-[92dvh] min-w-0 flex-col overflow-x-hidden overflow-y-hidden rounded-t-[28px] bg-[#fcfcfd] shadow-2xl"
            : "absolute left-1/2 top-1/2 w-[min(1180px,calc(100vw-32px))] min-w-0 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[32px] bg-[#fcfcfd] shadow-[0_32px_120px_rgba(15,23,42,0.24)]"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-200/80 px-4 py-3 sm:items-start sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="hidden text-[11px] font-semibold uppercase tracking-[0.24em] text-red-500 sm:block">Command Center V1</p>
            <h2 className="text-base font-semibold tracking-tight text-zinc-950 sm:mt-1 sm:text-xl">
              {createdProject ? "Project ready" : "Create a new project"}
            </h2>
            <p className="mt-1 hidden text-sm text-zinc-500 sm:block">
              {createdProject
                ? "A quick success moment before we drop you into the workspace."
                : "A simple intake that stays clear as you go. Routing and submission stay the same."}
            </p>
          </div>
          {!createdProject ? (
            <button onClick={() => onOpenChange(false)} className="rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100" aria-label="Close">
              ✕
            </button>
          ) : null}
        </div>

        <div ref={contentRef} className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto px-4 py-3 pb-20 sm:px-6 sm:py-4">
          {createdProject ? (
            <SuccessState
              project={createdProject}
              docsCount={docs.length}
              redirecting={redirecting}
              onOpenProject={() => navigateToProject(createdProject.id)}
              onCreateAnother={() => {
                if (redirectTimeoutRef.current) {
                  window.clearTimeout(redirectTimeoutRef.current);
                  redirectTimeoutRef.current = null;
                }
                setRedirecting(false);
                setCreatedProject(null);
                setDocs([]);
                setDocsError(null);
              }}
            />
          ) : (
            <CreateProjectForm
              prefillName={prefillName}
              prefillType={prefillType}
              docsSection={docsSection}
              onStepChange={scrollContentToTop}
              onSubmit={async (data) => {
                const project = await createProject(data);
                const docsResult = await uploadProjectDocs(project.id);

                if (!docsResult.ok) {
                  setDocsError(docsResult.message);
                  return;
                }

                setCreatedProject(project);
                scheduleRedirect(project.id);
              }}
              onCancel={() => onOpenChange(false)}
              isSubmitting={isSubmitting || docsBusy}
              error={error}
            />
          )}
        </div>
      </div>
    </div>
  );
}

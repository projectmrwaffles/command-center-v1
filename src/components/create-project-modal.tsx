"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Sparkles } from "lucide-react";
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
      Array.from({ length: 14 }, (_, index) => ({
        id: index,
        left: `${8 + ((index * 7) % 84)}%`,
        delay: `${(index % 7) * 110}ms`,
        duration: `${2200 + (index % 5) * 180}ms`,
        color:
          ["bg-red-400", "bg-amber-300", "bg-orange-300", "bg-rose-300", "bg-zinc-900"][index % 5],
      })),
    []
  );

  return (
    <div className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(254,242,242,0.95),rgba(255,255,255,0)_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 overflow-hidden">
        {confettiPieces.map((piece) => (
          <span
            key={piece.id}
            className={`celebration-confetti ${piece.color}`}
            style={{ left: piece.left, animationDelay: piece.delay, animationDuration: piece.duration }}
          />
        ))}
      </div>

      <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
        <div className="celebration-pulse flex h-16 w-16 items-center justify-center rounded-full bg-zinc-950 text-white shadow-[0_20px_50px_rgba(24,24,27,0.18)] sm:h-20 sm:w-20">
          <Check className="h-8 w-8 sm:h-10 sm:w-10" strokeWidth={2.2} />
        </div>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-red-600">
          <Sparkles className="h-3.5 w-3.5" />
          Project created
        </div>

        <h3 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
          {project.name || "Your project"} is ready.
        </h3>
        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600 sm:text-base">
          Nice. The intake is saved{docsCount > 0 ? ` and ${docsCount} file${docsCount === 1 ? " is" : "s are"} attached` : ""}. We’ll open the project page next so you can keep moving.
        </p>

        <div className="mt-6 grid w-full gap-3 sm:grid-cols-3">
          <div className="rounded-[24px] border border-zinc-200 bg-white px-4 py-4 text-left shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Status</p>
            <p className="mt-2 text-sm font-medium text-zinc-900">Created successfully</p>
          </div>
          <div className="rounded-[24px] border border-zinc-200 bg-white px-4 py-4 text-left shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Files</p>
            <p className="mt-2 text-sm font-medium text-zinc-900">{docsCount > 0 ? `${docsCount} uploaded` : "No uploads added"}</p>
          </div>
          <div className="rounded-[24px] border border-zinc-200 bg-white px-4 py-4 text-left shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Next</p>
            <p className="mt-2 text-sm font-medium text-zinc-900">Project workspace</p>
          </div>
        </div>

        <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onOpenProject}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Open project
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCreateAnother}
            className="rounded-2xl border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
          >
            Create another
          </button>
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          {redirecting ? "Redirecting automatically…" : "Redirect paused."}
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
    }
  }, [open]);

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

        <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto px-4 py-3 pb-20 sm:px-6 sm:py-4">
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

"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Sparkles, X } from "lucide-react";
import { CreateProjectForm } from "@/components/create-project-form";
import { Button } from "@/components/ui/button";
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
  redirecting,
  docsWarning,
  onOpenProject,
}: {
  project: CreatedProject;
  redirecting: boolean;
  docsWarning?: string | null;
  onOpenProject: () => void;
}) {
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 72 }, (_, index) => {
        const lane = index % 3;
        const laneBase = lane === 0 ? 18 : lane === 1 ? 50 : 82;
        const laneSpread = ((index * 11) % 18) - 9;
        const direction = lane === 1 ? (index % 2 === 0 ? -1 : 1) : lane === 0 ? -1 : 1;

        return {
          id: index,
          left: `${laneBase + laneSpread}%`,
          bottom: `${10 + (index % 4) * 4}px`,
          delay: `${(index % 12) * 22}ms`,
          duration: `${1320 + (index % 6) * 90}ms`,
          lift: `${188 + ((index * 17) % 92)}px`,
          drift: `${direction * (24 + ((index * 13) % 92))}px`,
          settle: `${direction * (10 + ((index * 7) % 26))}px`,
          rotate: `${direction * (120 + ((index * 19) % 180))}deg`,
          scale: `${0.88 + (index % 5) * 0.08}`,
          shape: index % 4 === 0 ? "rounded-sm" : index % 4 === 1 ? "rounded-full" : index % 4 === 2 ? "rounded-[999px]" : "rounded-[6px]",
          size:
            index % 8 === 0
              ? "h-6 w-3"
              : index % 8 === 1
                ? "h-5 w-5"
                : index % 8 === 2
                  ? "h-6 w-2.5"
                  : index % 8 === 3
                    ? "h-4.5 w-4.5"
                    : index % 8 === 4
                      ? "h-5 w-2.5"
                      : index % 8 === 5
                        ? "h-4.5 w-3"
                        : index % 8 === 6
                          ? "h-4 w-4"
                          : "h-5 w-2",
          color:
            [
              "bg-rose-400",
              "bg-amber-300",
              "bg-orange-300",
              "bg-fuchsia-300",
              "bg-zinc-900",
              "bg-emerald-300",
              "bg-sky-300",
              "bg-violet-400",
            ][index % 8],
        };
      }),
    []
  );

  const burstPieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, index) => ({
        id: index,
        angle: `${index * (360 / 26)}deg`,
        distance: `${78 + (index % 5) * 14}px`,
        delay: `${index * 12}ms`,
        duration: `${560 + (index % 4) * 55}ms`,
        color: ["bg-rose-400", "bg-amber-300", "bg-fuchsia-300", "bg-emerald-300", "bg-sky-300", "bg-zinc-900"][index % 6],
      })),
    []
  );

  const redirectStateLabel = redirecting ? "Opening workspace…" : "Redirect paused";
  const statusTone = redirecting
    ? {
        badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
        dot: "bg-emerald-500",
        summary: "Taking you there in a moment.",
      }
    : {
        badge: "border-amber-200 bg-amber-50 text-amber-700",
        dot: "bg-amber-500",
        summary: "Your project is ready to open.",
      };

  return (
    <div className="relative overflow-hidden px-3 py-4 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(254,215,170,0.52),rgba(255,255,255,0)_24%),radial-gradient(circle_at_18%_14%,rgba(251,207,232,0.18),rgba(255,255,255,0)_28%),radial-gradient(circle_at_82%_18%,rgba(253,230,138,0.16),rgba(255,255,255,0)_28%),linear-gradient(180deg,rgba(255,255,255,0.985),rgba(255,252,250,0.97))]" />
      <div className="celebration-overlay pointer-events-none absolute inset-x-0 top-0 z-40 h-[400px] overflow-hidden sm:h-[490px]">
        <div className="absolute inset-x-[-6%] top-0 h-full bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.985),rgba(255,247,247,0.46)_18%,rgba(255,255,255,0)_46%),radial-gradient(circle_at_18%_80%,rgba(251,191,36,0.10),rgba(255,255,255,0)_20%),radial-gradient(circle_at_82%_82%,rgba(244,63,94,0.10),rgba(255,255,255,0)_22%),radial-gradient(circle_at_50%_92%,rgba(217,70,239,0.08),rgba(255,255,255,0)_18%)]" />
        <span className="celebration-cannon celebration-cannon-left absolute bottom-8 left-[6%] h-24 w-24 rounded-full sm:bottom-10 sm:left-[12%] sm:h-28 sm:w-28" />
        <span className="celebration-cannon celebration-cannon-center absolute bottom-6 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full sm:bottom-8 sm:h-28 sm:w-28" />
        <span className="celebration-cannon celebration-cannon-right absolute bottom-8 right-[6%] h-24 w-24 rounded-full sm:bottom-10 sm:right-[12%] sm:h-28 sm:w-28" />
        {confettiPieces.map((piece) => (
          <span
            key={piece.id}
            className={`celebration-confetti ${piece.color} ${piece.shape} ${piece.size}`}
            style={{
              left: piece.left,
              bottom: piece.bottom,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
              ["--confetti-lift" as string]: piece.lift,
              ["--confetti-drift" as string]: piece.drift,
              ["--confetti-settle" as string]: piece.settle,
              ["--confetti-rotate" as string]: piece.rotate,
              ["--confetti-scale" as string]: piece.scale,
            }}
          />
        ))}
      </div>

      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="celebration-stage relative z-30 mt-0 flex h-[250px] w-full items-start justify-center sm:h-[300px]">
          <span className="celebration-burst-ring absolute top-10 h-40 w-40 rounded-full border border-white/80 sm:top-11 sm:h-48 sm:w-48" />
          <span className="celebration-burst-ring celebration-burst-ring-delay absolute top-4 h-56 w-56 rounded-full border border-rose-200/80 sm:top-5 sm:h-[17rem] sm:w-[17rem]" />
          <span className="celebration-flash absolute top-11 h-32 w-32 rounded-full sm:top-14 sm:h-40 sm:w-40" />
          <span className="celebration-flash celebration-flash-delay absolute top-5 h-52 w-52 rounded-full opacity-80 sm:h-64 sm:w-64" />

          <div className="relative mt-12 sm:mt-14">
            {burstPieces.map((piece) => (
              <span
                key={piece.id}
                className={`celebration-burst-piece ${piece.color}`}
                style={{
                  ["--burst-angle" as string]: piece.angle,
                  ["--burst-distance" as string]: piece.distance,
                  animationDelay: piece.delay,
                  animationDuration: piece.duration,
                }}
              />
            ))}

            <div className="celebration-orb relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.98),rgba(255,255,255,0.24)_58%,rgba(255,255,255,0)_70%)]" />
              <div className="celebration-pulse celebration-pulse-glow relative z-10 flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-full bg-zinc-950 text-white shadow-[0_20px_54px_rgba(24,24,27,0.18)] sm:h-24 sm:w-24">
                <Check className="h-11 w-11 sm:h-12 sm:w-12" strokeWidth={2.6} />
              </div>
              <div className="celebration-star celebration-star-delay absolute left-0 top-2 rounded-full bg-white/90 p-1 text-rose-500 shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="celebration-star absolute right-0 top-4 rounded-full bg-white/90 p-1 text-amber-500 shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="celebration-star celebration-star-delay absolute bottom-5 left-1 rounded-full bg-white/90 p-1 text-fuchsia-500 shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </div>

        <div className="celebration-card relative z-10 -mt-10 inline-flex items-center gap-2 rounded-full border border-rose-100/80 bg-white/94 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-600 shadow-sm backdrop-blur sm:-mt-12">
          <Sparkles className="h-3.5 w-3.5" />
          Project created
        </div>

        <div className="celebration-card mt-4 w-full max-w-md rounded-[28px] border border-white/85 bg-white/95 px-5 py-5 text-center shadow-[0_16px_42px_rgba(24,24,27,0.06)] backdrop-blur sm:px-6">
          <h3 className="text-[1.75rem] font-semibold tracking-tight text-zinc-950 sm:text-[2.5rem]">
            {project.name || "Your project"} is ready.
          </h3>
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-zinc-600">
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${statusTone.dot}`} />
            <span>{redirectStateLabel}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-500 sm:text-base">{statusTone.summary}</p>

          <div className="mt-4 overflow-hidden rounded-full bg-zinc-100/90">
            <div className={`redirect-progress h-1.5 rounded-full bg-[linear-gradient(90deg,#fb7185,#f59e0b,#18181b)] ${redirecting ? "is-active" : ""}`} />
          </div>

          {docsWarning ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-800">
              {docsWarning}
            </div>
          ) : null}

          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={onOpenProject}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${statusTone.badge}`}
            >
              Open workspace
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
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
  const { isSubmitting, error, createProject, resetCreateProjectState } = useCreateProject();
  const mobile = useIsMobile();

  const [docs, setDocs] = useState<File[]>([]);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docsBusy, setDocsBusy] = useState(false);
  const [createdProject, setCreatedProject] = useState<CreatedProject | null>(null);
  const [docsWarning, setDocsWarning] = useState<string | null>(null);
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
      resetCreateProjectState();
      setDocs([]);
      setDocsError(null);
      setDocsBusy(false);
      setCreatedProject(null);
      setDocsWarning(null);
      setRedirecting(false);
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [open, resetCreateProjectState]);

  useLayoutEffect(() => {
    if (!createdProject) return;
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [createdProject]);

  const scrollContentToTop = () => {
    const container = contentRef.current;
    if (!container) return;
    container.scrollTo({ top: 0, behavior: "auto" });
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
    }, 2800);
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
    <div className="overflow-hidden rounded-[28px] border border-red-100/70 bg-white p-4 shadow-[0_12px_30px_rgba(24,24,27,0.05)] sm:p-5">
      <div className="inline-flex items-center gap-2 rounded-full border border-red-200/80 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700 shadow-sm">
        <Sparkles className="h-3.5 w-3.5 text-red-500" />
        Supporting materials
      </div>
      <div className="mb-2 mt-4 text-sm font-semibold text-zinc-900">Supporting docs and images</div>
      <p className="mb-3 text-xs leading-5 text-zinc-500">Attach PRDs, screenshots, or reference images. They upload after project creation and stay private in project_docs.</p>

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
        className="block w-full rounded-2xl border border-dashed border-red-200 bg-white px-4 py-3 text-sm shadow-sm file:mr-3 file:rounded-full file:border-0 file:bg-red-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-red-700 hover:border-red-300"
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
      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]" onClick={() => !createdProject && onOpenChange(false)} />

      <div className={mobile ? undefined : "fixed inset-0 flex items-center justify-center px-6 py-6 xl:px-8"}>
        <div
          className={
            mobile
              ? "fixed inset-x-0 bottom-0 flex max-h-[92dvh] min-w-0 flex-col overflow-x-hidden overflow-y-hidden rounded-t-[32px] border border-white/70 bg-white shadow-[0_-14px_40px_rgba(24,24,27,0.16)]"
              : "flex max-h-[calc(100dvh-48px)] w-full max-w-[980px] min-w-0 flex-col overflow-hidden rounded-[32px] border border-red-100/70 bg-white shadow-[0_24px_72px_rgba(15,23,42,0.16)] xl:max-w-[1020px]"
          }
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative shrink-0 overflow-hidden border-b border-red-100/80 bg-white px-4 py-4 sm:px-6 sm:py-5">
            <div className="absolute inset-x-0 bottom-0 h-px bg-red-100/80" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-red-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700 shadow-sm backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5 text-red-500" />
                  {createdProject ? "Project handoff" : "New project intake"}
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-tight text-zinc-950 sm:text-[1.75rem]">
                  {createdProject ? "Project ready" : "Start a project"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                  {createdProject
                    ? "Review the handoff card or jump straight into the workspace."
                    : "Add the essentials, attach supporting materials, and review the routing before you create it."}
                </p>
              </div>
              {!createdProject ? (
                <Button onClick={() => onOpenChange(false)} variant="outline" size="icon" className="rounded-2xl border-red-200 bg-white/90 text-zinc-600 shadow-sm hover:bg-red-50" aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <div ref={contentRef} className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-white px-4 py-4 pb-20 sm:px-6 sm:py-5">
          {createdProject ? (
            <SuccessState
              project={createdProject}
              redirecting={redirecting}
              docsWarning={docsWarning}
              onOpenProject={() => navigateToProject(createdProject.id)}
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

                setDocsWarning(docsResult.ok ? null : docsResult.message);
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
    </div>
  );
}

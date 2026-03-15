"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { CreateProjectForm } from "@/components/create-project-form";
import { useCreateProject } from "@/hooks/use-create-project";
import { supabaseRealtime } from "@/lib/supabase-realtime";

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
  const { isSubmitting, error, createProject } = useCreateProject();
  const mobile = useIsMobile();

  const [docs, setDocs] = useState<File[]>([]);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docsBusy, setDocsBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useLayoutEffect(() => {
    if (open) {
      setDocs([]);
      setDocsError(null);
      setDocsBusy(false);
    }
  }, [open]);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />

      <div
        className={
          mobile
            ? "fixed inset-x-0 bottom-0 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl"
            : "absolute left-1/2 top-1/2 w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 p-4 pb-2">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">New Project</h2>
            <p className="text-sm text-zinc-500">Pick the closest fit, mix in what you need, then add any helpful details or docs.</p>
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-20">
          <CreateProjectForm
            prefillName={prefillName}
            prefillType={prefillType}
            onSubmit={async (data) => {
              const project = await createProject(data);
              const docsResult = await uploadProjectDocs(project.id);

              if (!docsResult.ok) {
                setDocsError(docsResult.message);
                return;
              }

              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
            isSubmitting={isSubmitting || docsBusy}
            error={error}
          />

          <div className="mt-5 border-t border-zinc-200 pt-4">
            <div className="mb-2 text-sm font-medium text-zinc-900">Upload docs (optional)</div>
            <p className="mb-3 text-xs text-zinc-500">PRD PDF or images. Stored privately in project_docs.</p>

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
        </div>
      </div>
    </div>
  );
}

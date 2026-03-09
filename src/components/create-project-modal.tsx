"use client";

import { useEffect, useMemo, useState } from "react";
import { CreateProjectForm } from "@/components/create-project-form";
import { useCreateProject } from "@/hooks/use-create-project";
import { supabaseRealtime } from "@/lib/supabase-realtime";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

function storageNotConfiguredMessage() {
  return (
    "Storage not configured: create bucket project_docs (private). " +
    "Supabase Dashboard → Storage → New bucket → name: project_docs → set Private." +
    ""
  );
}

export function CreateProjectModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  // reset on open
  useEffect(() => {
    if (!open) return;
    setDocs([]);
    setDocsError(null);
    setDocsBusy(false);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />

      {/* Panel: Drawer on mobile, Dialog on desktop */}
      <div
        className={
          mobile
            ? "absolute left-0 right-0 bottom-0 top-[15vh] bg-white rounded-t-2xl shadow-2xl flex flex-col"
            : "absolute left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-4 pb-2 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">New Project</h2>
            <p className="text-sm text-zinc-500">Create a project and optionally upload docs.</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
        <CreateProjectForm
          onSubmit={async (data) => {
            const project = await createProject(data);

            // Upload docs (optional)
            if (docs.length > 0) {
              setDocsBusy(true);
              setDocsError(null);

              const uploaded: any[] = [];
              for (const file of docs) {
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
                const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";
                const objectName = `${project.id}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;

                const { error: upErr } = await supabaseRealtime.storage
                  .from("project_docs")
                  .upload(objectName, file, {
                    contentType: file.type || undefined,
                    upsert: false,
                  });

                if (upErr) {
                  console.error("[Storage upload] error", upErr);
                  // Do not crash; show manual prerequisite.
                  setDocsError(storageNotConfiguredMessage());
                  break;
                }

                uploaded.push({
                  project_id: project.id,
                  type: file.type === "application/pdf" ? "prd_pdf" : file.type.startsWith("image/") ? "image" : "other",
                  title: file.name,
                  storage_path: objectName,
                  mime_type: file.type || null,
                  size_bytes: file.size,
                });
              }

              if (uploaded.length > 0) {
                // Insert metadata via existing server route? For now, insert via server role route to avoid RLS.
                const res = await fetch(`/api/projects/${project.id}/documents`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ documents: uploaded }),
                });

                if (!res.ok) {
                  const payload = await res.json().catch(() => ({}));
                  console.error("[documents insert] failed", payload);
                  setDocsError(payload.error || "Failed to save document metadata");
                }
              }

              setDocsBusy(false);
            }

            // Keep modal open if docs failed, otherwise close.
            if (!docsError) onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting || docsBusy}
          error={error}
        />

        {/* Docs upload */}
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
                <li key={f.name} className="flex items-center justify-between">
                  <span className="truncate">{f.name}</span>
                  <span className="ml-2 text-zinc-400">{Math.round(f.size / 1024)}KB</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>{/* End scrollable */}
      </div>
    </div>
  );
}

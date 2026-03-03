"use client";

import { useEffect, useMemo } from "react";
import { CreateProjectForm } from "@/components/create-project-form";
import { useCreateProject } from "@/hooks/use-create-project";

function useIsMobile() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
}

export function CreateProjectModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isSubmitting, error, createProject } = useCreateProject();
  const mobile = typeof window !== "undefined" ? useIsMobile() : false;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />

      {/* Panel: Drawer on mobile, Dialog on desktop */}
      <div
        className={
          mobile
            ? "absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-auto rounded-t-2xl bg-white p-5 shadow-2xl"
            : "absolute left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Create Project</h2>
            <p className="text-sm text-zinc-500">Create a new project and start adding docs.</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <CreateProjectForm
          onSubmit={async (data) => {
            await createProject(data);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
          error={error}
        />
      </div>
    </div>
  );
}

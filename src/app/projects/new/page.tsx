"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { CreateProjectModal } from "@/components/create-project-modal";

export default function NewProjectPage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) {
      router.push("/projects");
    }
  }, [open, router]);

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,rgba(254,226,226,0.85),rgba(255,255,255,0.96)_30%,rgba(255,237,213,0.85)_68%,rgba(255,247,237,0.92)_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto hidden max-w-6xl md:block">
        <div className="rounded-[32px] border border-red-100/80 bg-white/55 p-8 shadow-[0_24px_80px_rgba(239,68,68,0.10)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-red-500" />
            New project intake
          </div>
          <div className="mt-5 max-w-xl space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950">Start a project inside the shared warm workspace system.</h1>
            <p className="text-sm leading-6 text-zinc-600 sm:text-base">
              This route now carries the same branded backdrop as Projects and Dashboard while preserving the existing create flow and redirect behavior.
            </p>
          </div>
        </div>
      </div>

      <CreateProjectModal open={open} onOpenChange={setOpen} />
    </div>
  );
}

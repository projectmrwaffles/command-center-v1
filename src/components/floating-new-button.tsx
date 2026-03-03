"use client";

import { useState } from "react";
import { CreateProjectModal } from "@/components/create-project-modal";
import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";

export function FloatingNewButton() {
  const [showCreateProject, setShowCreateProject] = useState(false);
  const pathname = usePathname();

  // Only show on pages where creating projects makes sense
  const showOnPages = ["/dashboard", "/overview", "/projects"];
  const isVisible = showOnPages.some((p) => pathname?.startsWith(p));

  if (!isVisible) return null;

  return (
    <>
      <button
        onClick={() => setShowCreateProject(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 md:bottom-8 md:right-8"
        aria-label="Create project"
      >
        <Plus className="h-6 w-6" />
      </button>

      <CreateProjectModal open={showCreateProject} onOpenChange={setShowCreateProject} />
    </>
  );
}

"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";

export function FloatingNewButton() {
  const pathname = usePathname();

  const showOnPages = ["/dashboard", "/overview", "/projects"];
  const isVisible = showOnPages.some((p) => pathname?.startsWith(p)) && pathname !== "/projects/new";

  if (!isVisible) return null;

  return (
    <Link
      href="/projects/new"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-700 md:bottom-8 md:right-8"
      aria-label="Create project"
    >
      <Plus className="h-6 w-6" />
    </Link>
  );
}

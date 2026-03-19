"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateProjectModal } from "@/components/create-project-modal";
import { DbBanner } from "@/components/db-banner";
import { legacyTypeToLabel } from "@/lib/project-intake";

function ProjectsContent() {
  const searchParams = useSearchParams();
  const showNew = searchParams.get("new") === "true";

  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(showNew);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects || []);
      setError(null);
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <DbBanner />

      <CreateProjectModal
        open={showCreateModal}
        onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) {
            fetchData();
          }
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-900">Projects</h1>
          <p className="text-sm text-zinc-500">Active projects, progress, and delivery health</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex w-full items-center justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 sm:w-auto"
        >
          New Project
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-lg border border-zinc-200 bg-white p-4">
              <div className="mb-2 h-5 w-1/3 rounded bg-zinc-200"></div>
              <div className="flex gap-4">
                <div className="h-4 w-16 rounded bg-zinc-200"></div>
                <div className="h-4 w-16 rounded bg-zinc-200"></div>
                <div className="h-4 w-20 rounded bg-zinc-200"></div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="py-12 text-center text-red-600">{error}</div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 py-16">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
            <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <p className="mb-2 text-lg font-medium text-zinc-700">No projects yet</p>
          <p className="mb-4 text-sm text-zinc-500">Create your first project to get started</p>
          <button onClick={() => setShowCreateModal(true)} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block min-w-0">
              <Card className="min-w-0 border-zinc-200 transition-all hover:border-zinc-300 hover:shadow-md">
                <CardHeader className="space-y-2 pb-2">
                  <CardTitle className="break-words text-base leading-snug">{p.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 py-2">
                  <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">{legacyTypeToLabel(p.type || "other")}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-1 capitalize text-zinc-700">{p.status || "active"}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">{p.progress_pct || 0}% complete</span>
                  </div>
                  {p.intake_summary ? (
                    <p className="mobile-summary-clamp text-sm leading-6 text-zinc-600">{p.intake_summary}</p>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <DbBanner />
          <div className="py-12 text-center text-zinc-500">Loading...</div>
        </div>
      }
    >
      <ProjectsContent />
    </Suspense>
  );
}

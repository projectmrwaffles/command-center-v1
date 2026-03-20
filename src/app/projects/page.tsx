"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, FolderKanban, Layers3, Plus, Sparkles, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateProjectModal } from "@/components/create-project-modal";
import { DbBanner } from "@/components/db-banner";
import { legacyTypeToLabel } from "@/lib/project-intake";

type Project = {
  id: string;
  name: string;
  status?: string | null;
  type?: string | null;
  description?: string | null;
  intake_summary?: string | null;
  progress_pct?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function formatRelativeDate(value?: string | null) {
  if (!value) return "Recently updated";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) return "Updated today";
  if (diffDays === 1) return "Updated yesterday";
  if (diffDays < 7) return `Updated ${diffDays} days ago`;

  return `Updated ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function getStatusTone(status?: string | null) {
  switch ((status || "active").toLowerCase()) {
    case "completed":
      return {
        badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
        dot: "bg-emerald-500",
        label: "Completed",
      };
    case "blocked":
      return {
        badge: "border-amber-200 bg-amber-50 text-amber-700",
        dot: "bg-amber-500",
        label: "Blocked",
      };
    case "archived":
      return {
        badge: "border-zinc-200 bg-zinc-100 text-zinc-600",
        dot: "bg-zinc-400",
        label: "Archived",
      };
    default:
      return {
        badge: "border-sky-200 bg-sky-50 text-sky-700",
        dot: "bg-sky-500",
        label: "Active",
      };
  }
}

function ProjectsContent() {
  const searchParams = useSearchParams();
  const showNew = searchParams.get("new") === "true";

  const [projects, setProjects] = useState<Project[]>([]);
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

  const stats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((project) => (project.status || "active").toLowerCase() === "active").length;
    const completed = projects.filter((project) => (project.status || "").toLowerCase() === "completed").length;
    const avgProgress = total > 0 ? Math.round(projects.reduce((sum, project) => sum + (project.progress_pct || 0), 0) / total) : 0;

    return { total, active, completed, avgProgress };
  }, [projects]);

  return (
    <div className="space-y-6 md:space-y-8">
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

      <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),rgba(255,255,255,0.92)_35%,rgba(244,244,245,0.96)_100%)] shadow-[0_20px_60px_rgba(24,24,27,0.06)]">
        <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-zinc-900" />
              Project workspace
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Projects</h1>
              <p className="max-w-xl text-sm leading-6 text-zinc-600 sm:text-base">
                Track active work, scan delivery health, and jump into the right project without digging through generic cards.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200/80 bg-white/85 p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                  <Layers3 className="h-4 w-4" />
                  Total projects
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{stats.total}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200/80 bg-white/85 p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                  <FolderKanban className="h-4 w-4" />
                  Active now
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{stats.active}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200/80 bg-white/85 p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                  <Target className="h-4 w-4" />
                  Avg. progress
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{stats.avgProgress}%</div>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[260px] lg:items-end">
            <div className="rounded-2xl border border-zinc-200/80 bg-white/90 p-3 shadow-sm sm:p-4 lg:max-w-xs">
              <div className="text-sm font-medium text-zinc-900">Start something new</div>
              <p className="mt-1 text-sm leading-6 text-zinc-500">Create a project from here instead of relying on a floating action button.</p>
              <Button onClick={() => setShowCreateModal(true)} size="lg" className="mt-4 w-full rounded-xl">
                <Plus className="h-4 w-4" />
                New project
              </Button>
            </div>
            {stats.completed > 0 ? <p className="px-1 text-xs text-zinc-500">{stats.completed} completed project{stats.completed === 1 ? "" : "s"} in the archive-ready set.</p> : null}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="h-5 w-24 rounded-full bg-zinc-200" />
                <div className="h-5 w-20 rounded-full bg-zinc-200" />
              </div>
              <div className="mb-3 h-6 w-2/3 rounded bg-zinc-200" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-zinc-200" />
                <div className="h-4 w-5/6 rounded bg-zinc-200" />
              </div>
              <div className="mt-5 h-2 w-full rounded-full bg-zinc-200" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-12 text-center text-red-700 shadow-sm">{error}</div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
            <FolderKanban className="h-8 w-8 text-zinc-400" />
          </div>
          <p className="text-xl font-semibold tracking-tight text-zinc-900">No projects yet</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">Create your first project to start routing work, tracking delivery, and building a more useful overview here.</p>
          <Button onClick={() => setShowCreateModal(true)} size="lg" className="mt-6 rounded-xl px-5">
            <Plus className="h-4 w-4" />
            Create your first project
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const typeLabel = legacyTypeToLabel(project.type || "other");
            const progress = Math.max(0, Math.min(100, project.progress_pct || 0));
            const statusTone = getStatusTone(project.status);
            const summary = project.intake_summary || project.description || "Open the project to see its current scope, active tasks, and delivery details.";

            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="group block min-w-0">
                <Card className="flex h-full min-w-0 flex-col rounded-[24px] border-zinc-200/90 bg-white/95 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_18px_40px_rgba(24,24,27,0.08)]">
                  <CardContent className="flex h-full flex-col gap-5 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-3">
                        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-600">
                          <span className="h-2 w-2 rounded-full bg-zinc-400" />
                          {typeLabel}
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-zinc-700">{project.name}</h2>
                          <p className="mt-2 mobile-summary-clamp text-sm leading-6 text-zinc-600">{summary}</p>
                        </div>
                      </div>

                      <div className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone.badge}`}>
                        <span className={`h-2 w-2 rounded-full ${statusTone.dot}`} />
                        {statusTone.label}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Progress</p>
                          <p className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">{progress}% complete</p>
                        </div>
                        <div className="text-right text-xs text-zinc-500">{formatRelativeDate(project.updated_at || project.created_at)}</div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200">
                        <div className="h-full rounded-full bg-zinc-900 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-zinc-100 pt-1 text-sm text-zinc-500">
                      <span>{project.created_at ? `Created ${new Date(project.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Recently created"}</span>
                      <span className="inline-flex items-center gap-1 font-medium text-zinc-900">
                        View project
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
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

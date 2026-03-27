"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, FolderKanban, Layers3, Plus, Sparkles, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandedEmptyState } from "@/components/ui/branded-empty-state";
import { PageHero, PageHeroStat } from "@/components/ui/page-hero";
import { ProjectStatusBadge, ProjectTypeBadge } from "@/components/ui/project-badges";
import { CreateProjectModal } from "@/components/create-project-modal";
import { DbBanner } from "@/components/db-banner";
import { getProjectStatusTone } from "@/lib/project-ui";
import { formatRelativeTimestamp, getExecutionTone } from "@/components/ui/execution-visibility";

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
  truth?: {
    headline?: string;
    summary?: string;
    execution?: { label?: string };
    counts?: {
      delivery?: { total?: number; queued?: number; running?: number; done?: number; blocked?: number };
      bootstrap?: { total?: number };
    };
  } | null;
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

      <PageHero>
        <div className="pointer-events-none absolute" />
        <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-700">
              <Sparkles className="h-3.5 w-3.5 text-red-500" />
              Project workspace
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Projects</h1>
              <p className="max-w-xl text-sm leading-6 text-zinc-600 sm:text-base">
                Track active work, scan delivery health, and jump into the right project without digging through generic cards.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <PageHeroStat className="border-red-100">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-red-700">
                  <Layers3 className="h-4 w-4 text-red-500" />
                  Total projects
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{stats.total}</div>
              </PageHeroStat>
              <PageHeroStat className="border-rose-100">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-rose-700">
                  <FolderKanban className="h-4 w-4 text-rose-500" />
                  Active now
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{stats.active}</div>
              </PageHeroStat>
              <PageHeroStat className="border-emerald-100">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
                  <Target className="h-4 w-4 text-emerald-500" />
                  Avg. progress
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{stats.avgProgress}%</div>
              </PageHeroStat>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[260px] lg:items-end">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4 lg:max-w-xs">
              <div className="text-sm font-medium text-zinc-900">Start something new</div>
              <p className="mt-1 text-sm leading-6 text-zinc-500">Create a project from here instead of relying on a floating action button.</p>
              <Button onClick={() => setShowCreateModal(true)} size="lg" variant="warm" className="mt-4 w-full rounded-xl">
                <Plus className="h-4 w-4" />
                New project
              </Button>
            </div>
            {stats.completed > 0 ? <p className="px-1 text-xs text-zinc-500">{stats.completed} completed project{stats.completed === 1 ? "" : "s"} in the archive-ready set.</p> : null}
          </div>
        </div>
      </PageHero>

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
        <BrandedEmptyState
          icon={<FolderKanban className="h-8 w-8 text-red-600" />}
          title="No projects yet"
          description="Create your first project to start routing work, tracking delivery, and building a more useful overview here."
          action={
            <Button onClick={() => setShowCreateModal(true)} size="lg" variant="warm" className="rounded-xl px-5">
              <Plus className="h-4 w-4" />
              Create your first project
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const progress = Math.max(0, Math.min(100, project.progress_pct || 0));
            const statusTone = getProjectStatusTone(project.status);
            const executionTone = getExecutionTone({ status: project.status, blocked: project.status === "blocked" });
            const summary = project.truth?.headline || project.intake_summary || project.description || "Open the project to see its current scope, active tasks, and delivery details.";

            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="group block min-w-0">
                <Card variant="featured" className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-[24px]">
                                    <CardContent className="flex h-full flex-col gap-5 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-3">
                        <ProjectTypeBadge type={project.type} status={project.status} />
                        <div>
                          <h2 className="text-lg font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-red-700">{project.name}</h2>
                          <p className="mt-2 mobile-summary-clamp text-sm leading-6 text-zinc-600">{summary}</p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <ProjectStatusBadge status={project.status} className="shrink-0" />
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${executionTone.badgeClassName}`}>{project.truth?.execution?.label || executionTone.label}</span>
                      </div>
                    </div>

                    <div className={`rounded-2xl border p-4 ${statusTone.surface}`}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Progress</p>
                          <div className="mt-1 flex items-center gap-2">
                            <p className="text-lg font-semibold tracking-tight text-zinc-950">{progress}% complete</p>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone.pill}`}>{statusTone.label}</span>
                          </div>
                          {project.truth?.summary ? <p className="mt-2 max-w-sm text-xs leading-5 text-zinc-600">{project.truth.summary}</p> : null}
                        </div>
                        <div className="text-right text-xs text-zinc-500">
                          <div>{formatRelativeDate(project.updated_at || project.created_at)}</div>
                          <div className="mt-1">{formatRelativeTimestamp(project.updated_at || project.created_at)}</div>
                          {project.truth?.counts ? <div className="mt-1">{project.truth.counts.delivery?.queued || 0} queued · {project.truth.counts.delivery?.running || 0} running · {project.truth.counts.bootstrap?.total || 0} bootstrap</div> : null}
                        </div>
                      </div>
                      <div className={`mt-3 h-2 overflow-hidden rounded-full ${statusTone.progressTrack}`}>
                        <div className={`h-full rounded-full ${statusTone.progress} transition-all`} style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-zinc-100 pt-1 text-sm text-zinc-500">
                      <span>{project.created_at ? `Created ${new Date(project.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Recently created"}</span>
                      <span className="inline-flex items-center gap-1 font-medium text-red-700 transition-colors group-hover:text-red-800">
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

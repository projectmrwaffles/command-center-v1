"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatIntakeValue,
  getReadinessOption,
  getRoutingSummary,
  legacyTypeToLabel,
} from "@/lib/project-intake";
import { getProjectLinkEntries, getProjectLinkSuggestions, PROJECT_LINK_FIELDS, PROJECT_LINK_LABELS, type ProjectLinks } from "@/lib/project-links";
import { useRealtimeStore } from "@/lib/realtime-store";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

type ProjectDocument = {
  id: string;
  type: string;
  title: string;
  url?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  created_at: string;
};

type ProjectDetail = {
  project: {
    name: string;
    status: string;
    type?: string | null;
    progress_pct: number;
    intake_summary?: string | null;
    updated_at: string;
    description?: string | null;
    intake?: any;
    links?: ProjectLinks | null;
    [key: string]: any;
  };
  teams: any[];
  tasks: any[];
  events: any[];
  recentSignals?: Array<{
    id: string;
    kind: "blocked" | "approval" | "completed" | "progress" | "activity";
    title: string;
    detail: string;
    timestamp: string;
    actorName?: string | null;
  }>;
  stats: {
    totalTasks: number;
    doneTasks: number;
    blockedTasks: number;
    inProgressTasks: number;
    pendingApprovals?: number;
  };
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-700 border-green-200",
    paused: "bg-amber-100 text-amber-700 border-amber-200",
    completed: "bg-blue-100 text-blue-700 border-blue-200",
    archived: "bg-zinc-100 text-zinc-700 border-zinc-200",
  };
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", styles[status] || styles.active)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    todo: "bg-zinc-100 text-zinc-600",
    in_progress: "bg-blue-100 text-blue-700",
    review: "bg-purple-100 text-purple-700",
    done: "bg-green-100 text-green-700",
    blocked: "bg-red-100 text-red-700",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", styles[status] || styles.todo)}>
      {status.replace("_", " ")}
    </span>
  );
}

function SignalBadge({ kind }: { kind: string }) {
  const styles: Record<string, string> = {
    blocked: "bg-red-100 text-red-700",
    approval: "bg-amber-100 text-amber-700",
    completed: "bg-green-100 text-green-700",
    progress: "bg-blue-100 text-blue-700",
    activity: "bg-zinc-100 text-zinc-700",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium uppercase", styles[kind] || styles.activity)}>{kind}</span>;
}

function formatBytes(value?: number | null) {
  if (!value) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function artifactEmptyState(projectType?: string | null, intake?: any) {
  if (intake?.shape === "launch-campaign" || ["marketing_growth", "marketing"].includes(projectType || "")) {
    return "No campaign links or creative artifacts added yet.";
  }
  if (["product_build", "ops_enablement", "saas", "web_app", "native_app"].includes(projectType || "")) {
    return "No repo, environment, or build links added yet.";
  }
  return "No project links or artifacts added yet.";
}

function LinkEditor({
  projectId,
  projectType,
  intake,
  links,
  onSaved,
}: {
  projectId: string;
  projectType?: string | null;
  intake?: any;
  links?: ProjectLinks | null;
  onSaved: (links: ProjectLinks | null) => void;
}) {
  const [draft, setDraft] = useState<ProjectLinks>(links || {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const suggestedFields = useMemo(() => getProjectLinkSuggestions(projectType, intake), [projectType, intake]);

  useEffect(() => {
    setDraft(links || {});
  }, [links]);

  const orderedFields = useMemo(() => {
    const used = PROJECT_LINK_FIELDS.filter((key) => Boolean(draft[key]));
    const suggestedUnused = suggestedFields.filter((key) => !used.includes(key));
    const remaining = PROJECT_LINK_FIELDS.filter((key) => !used.includes(key) && !suggestedUnused.includes(key));
    return [...used, ...suggestedUnused, ...remaining];
  }, [draft, suggestedFields]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: draft }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to save links");
      onSaved(payload.project?.links || null);
      setMessage("Saved");
    } catch (e: any) {
      setMessage(e.message || "Failed to save links");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">
        Add links here after intake. This page is the canonical home for the repo, designs, previews, docs, campaign assets, and other working artifacts.
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestedFields.map((key) => (
          <span key={key} className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">Suggested: {PROJECT_LINK_LABELS[key]}</span>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {orderedFields.map((key) => (
          <label key={key} className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">{PROJECT_LINK_LABELS[key]} URL</span>
            <input
              type="url"
              value={draft[key] || ""}
              onChange={(e) => {
                const value = e.target.value;
                setDraft((current) => {
                  const next = { ...current };
                  if (value.trim()) next[key] = value;
                  else delete next[key];
                  return next;
                });
                setMessage(null);
              }}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
              placeholder={`https://${key === "github" ? "github.com/org/repo" : key === "preview" ? "preview.example.com" : key === "production" ? "app.example.com" : key === "docs" ? "docs.example.com" : key === "figma" ? "figma.com/file/..." : "admin.example.com"}`}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-xs", message === "Saved" ? "text-green-600" : "text-zinc-500")}>{message || "Only add the links that matter for this project type."}</p>
        <button onClick={handleSave} disabled={saving} className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
          {saving ? "Saving..." : "Save project links"}
        </button>
      </div>
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const agentsById = useRealtimeStore((s) => s.agentsById);

  const [data, setData] = useState<ProjectDetail | null>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [taskDesc, setTaskDesc] = useState("");

  const fetchProject = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [projectRes, docsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`, { cache: "no-store" }),
        fetch(`/api/projects/${projectId}/documents`, { cache: "no-store" }),
      ]);

      if (!projectRes.ok) {
        const err = await projectRes.json().catch(() => ({ error: "Failed to load project" }));
        throw new Error(err.error || "Failed to load project");
      }

      const json = await projectRes.json();
      setData(json);

      if (docsRes.ok) {
        const docsJson = await docsRes.json();
        setDocuments(docsJson.documents || []);
      } else {
        setDocuments([]);
      }

      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load project");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) fetchProject(true);
  }, [projectId, fetchProject]);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled || document.visibilityState !== "visible" || !navigator.onLine) return;
      await fetchProject(false);
    };

    const interval = window.setInterval(tick, 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [projectId, fetchProject]);

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(newStatus);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const json = await res.json();
      setData((prev) => (prev ? { ...prev, project: { ...prev.project, ...json.project } } : prev));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    setActionLoading("delete");
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      window.location.href = "/projects";
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
      setShowDeleteConfirm(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTaskTitle, description: newTaskDesc }),
      });
      if (!res.ok) throw new Error("Failed to create task");
      setNewTaskTitle("");
      setNewTaskDesc("");
      setShowTaskModal(false);
      await fetchProject(false);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleUpdateTask = async () => {
    if (!selectedTask) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${selectedTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: taskDesc, status: selectedTask.status }),
      });
      if (!res.ok) throw new Error("Failed to save task");
      setShowTaskModal(false);
      await fetchProject(false);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${selectedTask.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete task");
      setShowTaskModal(false);
      await fetchProject(false);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleTaskClick = (task: any) => {
    setSelectedTask(task);
    setTaskDesc(task.description || "");
    setShowTaskModal(true);
  };

  const taskGroups = useMemo(() => {
    const list = data?.tasks || [];
    return {
      todo: list.filter((task: any) => task.status === "todo"),
      inProgress: list.filter((task: any) => task.status === "in_progress" || task.status === "review"),
      done: list.filter((task: any) => task.status === "done"),
      blocked: list.filter((task: any) => task.status === "blocked"),
    };
  }, [data?.tasks]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-200 border-t-red-600" />
        <div className="text-zinc-500">Loading project…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-6">
            <div className="flex items-center gap-2 font-medium text-red-700">
              <span className="text-xl">⚠️</span>
              <p>Error loading project</p>
            </div>
            <p className="mt-2 text-sm text-red-600">{error}</p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => fetchProject(true)} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                Retry
              </button>
              <Link href="/projects" className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                ← Back to Projects
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.project) {
    return null;
  }

  const { project, teams, tasks, recentSignals = [], stats } = data;
  const intake = project.intake || null;
  const routing = intake ? getRoutingSummary(intake) : null;
  const projectLinks = getProjectLinkEntries(project.links);
  const suggestedProjectLinks = getProjectLinkSuggestions(project.type, intake);

  return (
    <div className="space-y-6 overflow-x-hidden pb-10">
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Delete this project?</h3>
            <p className="mt-2 text-sm text-zinc-600">This cannot be undone.</p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
              <button onClick={handleDelete} disabled={actionLoading === "delete"} className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {actionLoading === "delete" ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/projects" className="text-zinc-400 hover:text-zinc-600">←</Link>
            <h1 className="truncate text-2xl font-semibold text-zinc-900">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 sm:text-sm">
            {project.type && <span>{legacyTypeToLabel(project.type)}</span>}
            <span>{project.progress_pct}% complete</span>
            {project.intake_summary ? <span className="max-w-full truncate">{project.intake_summary}</span> : null}
            <span>Updated {new Date(project.updated_at).toLocaleDateString()}</span>
          </div>
          {project.description && <p className="mt-3 max-w-3xl text-sm text-zinc-600">{project.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project.status === "active" ? (
            <button onClick={() => handleStatusChange("paused")} disabled={actionLoading === "paused"} className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 sm:text-sm disabled:opacity-50">{actionLoading === "paused" ? "..." : "Pause"}</button>
          ) : project.status === "paused" ? (
            <button onClick={() => handleStatusChange("active")} disabled={actionLoading === "active"} className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 sm:text-sm disabled:opacity-50">{actionLoading === "active" ? "..." : "Resume"}</button>
          ) : null}
          <button onClick={() => { setSelectedTask(null); setShowTaskModal(true); }} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 sm:text-sm">New Task</button>
          <button onClick={() => setShowDeleteConfirm(true)} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 sm:text-sm">Delete</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Delivery tasks", stats.totalTasks, "text-zinc-900"],
          ["In Progress", stats.inProgressTasks, "text-blue-600"],
          ["Done", stats.doneTasks, "text-green-600"],
          ["Blocked", stats.blockedTasks, "text-red-600"],
          ["Approvals", stats.pendingApprovals || 0, "text-amber-600"],
        ].map(([label, value, valueClass]) => (
          <Card key={String(label)} className="border-zinc-200">
            <CardContent className="py-3">
              <div className="text-[10px] text-zinc-500 sm:text-xs">{label}</div>
              <div className={cn("text-xl font-semibold", String(valueClass))}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-zinc-500">
          <span>Completion</span>
          <span>{project.progress_pct}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500" style={{ width: `${project.progress_pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <Card className="border-zinc-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Project Brief</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {routing ? (
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">Primary route: {routing.ownerTeam}</span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700">QC: {routing.qcTeam}</span>
                </div>
              ) : null}

              {intake ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Shape</div>
                    <div className="mt-1 text-sm text-zinc-900">{formatIntakeValue(intake.shape)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Readiness</div>
                    <div className="mt-1 text-sm text-zinc-900">{getReadinessOption(intake.stage, intake.confidence)?.label || formatIntakeValue(intake.stage)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Context</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {(intake.context || []).length > 0 ? (
                        intake.context.map((value: string) => (
                          <span key={value} className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{formatIntakeValue(value)}</span>
                        ))
                      ) : (
                        <span className="text-sm text-zinc-500">None selected</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Capabilities</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {(intake.capabilities || []).length > 0 ? (
                        intake.capabilities.map((value: string) => (
                          <span key={value} className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{formatIntakeValue(value)}</span>
                        ))
                      ) : (
                        <span className="text-sm text-zinc-500">None selected</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Confidence</div>
                    <div className="mt-1 text-sm text-zinc-900">{formatIntakeValue(intake.confidence)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Summary</div>
                    <div className="mt-1 text-sm text-zinc-900">{project.intake_summary || intake.summary || "Not set"}</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No structured intake captured for this project.</p>
              )}

              {intake?.goals ? (
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Goals / notes</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600">{intake.goals}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-zinc-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Task Board</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-zinc-500">No delivery tasks yet. Add the first task to kick off execution.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Backlog", taskGroups.todo],
                    ["In Flight", taskGroups.inProgress],
                    ["Blocked", taskGroups.blocked],
                    ["Done", taskGroups.done],
                  ].map(([label, bucket]) => (
                    <div key={String(label)} className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-medium text-zinc-900">{label}</h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-zinc-500">{(bucket as any[]).length}</span>
                      </div>
                      <div className="space-y-2">
                        {(bucket as any[]).length === 0 ? (
                          <div className="rounded-lg border border-dashed border-zinc-200 bg-white px-3 py-4 text-xs text-zinc-400">No items</div>
                        ) : (
                          (bucket as any[]).map((task: any) => {
                            const assignee = task.assignee_agent_id ? agentsById.get(task.assignee_agent_id) : null;
                            return (
                              <button key={task.id} onClick={() => handleTaskClick(task)} className="block w-full rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-zinc-300 hover:shadow">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="line-clamp-2 text-sm font-medium text-zinc-900">{task.title}</span>
                                  <TaskStatusBadge status={task.status} />
                                </div>
                                {(task.description || assignee) && (
                                  <div className="mt-2 space-y-1">
                                    {task.description && <p className="line-clamp-2 text-xs text-zinc-500">{task.description}</p>}
                                    {assignee && <p className="text-[11px] text-zinc-400">Owner: {assignee.name}</p>}
                                  </div>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-zinc-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Links & artifacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {suggestedProjectLinks.map((key) => (
                  <span key={key} className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700">{PROJECT_LINK_LABELS[key]}</span>
                ))}
              </div>

              {projectLinks.length === 0 ? (
                <p className="text-sm text-zinc-500">{artifactEmptyState(project.type, intake)}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {projectLinks.map((link) => (
                    <a
                      key={link.key}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-zinc-100 p-3 transition hover:border-zinc-300 hover:shadow-sm"
                    >
                      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">{link.label}</div>
                      <div className="mt-1 line-clamp-2 text-sm font-medium text-zinc-900">{link.url}</div>
                      <div className="mt-2 text-xs font-medium text-red-600">Open ↗</div>
                    </a>
                  ))}
                </div>
              )}

              <LinkEditor
                projectId={projectId}
                projectType={project.type}
                intake={intake}
                links={project.links}
                onSaved={(links) => setData((prev) => (prev ? { ...prev, project: { ...prev.project, links } } : prev))}
              />
            </CardContent>
          </Card>

          <Card className="border-zinc-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent Signals</CardTitle>
            </CardHeader>
            <CardContent>
              {recentSignals.length === 0 ? (
                <p className="text-sm text-zinc-500">No meaningful signals yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentSignals.map((signal) => (
                    <div key={signal.id} className="rounded-xl border border-zinc-100 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <SignalBadge kind={signal.kind} />
                            <p className="text-sm font-medium text-zinc-900">{signal.title}</p>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">{signal.detail}</p>
                          {signal.actorName && <p className="mt-1 text-[11px] text-zinc-400">By {signal.actorName}</p>}
                        </div>
                        <span className="whitespace-nowrap text-[11px] text-zinc-400">{new Date(signal.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Supporting docs & uploads</CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-zinc-500">No supporting docs or uploaded artifacts yet.</p>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div key={doc.id} className="rounded-xl border border-zinc-100 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase text-zinc-700">{doc.type.replace(/_/g, " ")}</span>
                            <p className="truncate text-sm font-medium text-zinc-900">{doc.title}</p>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {formatBytes(doc.size_bytes)}
                            {doc.mime_type ? ` • ${doc.mime_type}` : ""}
                            {` • Added ${new Date(doc.created_at).toLocaleDateString()}`}
                          </p>
                          {doc.storage_path ? <p className="mt-1 break-all text-[11px] text-zinc-400">{doc.storage_path}</p> : null}
                          {doc.url ? <a href={doc.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-red-600 hover:underline">Open link</a> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Teams</CardTitle>
            </CardHeader>
            <CardContent>
              {teams.length === 0 ? (
                <p className="text-sm text-zinc-500">No teams assigned.</p>
              ) : (
                <div className="space-y-3">
                  {teams.map((team: any) => (
                    <div key={team.id} className="rounded-xl border border-zinc-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-zinc-900">{team.name}</p>
                        <StatusBadge status={team.status === "on_track" ? "active" : team.status === "waiting" ? "archived" : team.status} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                        <span>{team.memberCount} members</span>
                        <span>{team.activeAgents} active now</span>
                        <span>{team.taskCount} owned tasks</span>
                        <span>{team.completedTasks || 0} completed</span>
                      </div>
                      {team.blockedTasks > 0 && <p className="mt-2 text-xs text-red-600">{team.blockedTasks} blocked task{team.blockedTasks === 1 ? "" : "s"}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowTaskModal(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-zinc-900">{selectedTask ? "Task Details" : "New delivery task"}</h3>
            {selectedTask ? (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Task</label>
                  <p className="text-sm font-medium text-zinc-900">{selectedTask.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">Status: {selectedTask.status?.replace("_", " ")} • Assigned to: {selectedTask.assignee_agent_id ? agentsById.get(selectedTask.assignee_agent_id)?.name : "Unassigned"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Status</label>
                  <select
                    value={selectedTask.status}
                    onChange={(e) => setSelectedTask((prev: any) => (prev ? { ...prev, status: e.target.value } : prev))}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  >
                    <option value="todo">To do</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                    <option value="blocked">Blocked</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Description / directions</label>
                  <textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Add notes or directions for the assigned agent..." rows={5} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Task name</label>
                  <input type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="What outcome should be delivered..." className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Description</label>
                  <textarea value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} placeholder="Execution notes, acceptance criteria, or handoff details..." rows={4} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowTaskModal(false)} className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
              {selectedTask ? (
                <button onClick={handleDeleteTask} className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Delete</button>
              ) : null}
              <button onClick={selectedTask ? handleUpdateTask : handleCreateTask} disabled={selectedTask ? false : !newTaskTitle.trim()} className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{selectedTask ? "Save" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

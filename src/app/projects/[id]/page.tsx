"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useRealtimeStore } from "@/lib/realtime-store";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

type ProjectDetail = {
  project: any;
  teams: any[];
  milestones: any[];
  sprints: any[];
  tasks: any[];
  stats: {
    totalTasks: number;
    doneTasks: number;
    blockedTasks: number;
    inProgressTasks: number;
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

function TeamStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-500",
    on_track: "bg-green-500",
    at_risk: "bg-amber-500",
    waiting: "bg-zinc-400",
    blocked: "bg-red-500",
    complete: "bg-blue-500",
    paused: "bg-amber-500",
  };
  return <span className={cn("h-2 w-2 rounded-full", colors[status] || "bg-zinc-400")} />;
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

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const store = useRealtimeStore();
  const agentsById = useRealtimeStore((s) => s.agentsById);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to load project");
        }
        const json = await res.json();
        setData(json);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    if (projectId) fetchProject();
  }, [projectId]);

  // Subscribe to realtime updates for this project
  useEffect(() => {
    const handleProjectUpdate = (payload: any) => {
      if (payload.eventType !== "DELETE" && payload.new?.id === projectId) {
        setData((prev) => prev ? { ...prev, project: payload.new } : null);
      }
    };

    // The store already subscribes, just trigger a refetch on changes
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {}
    }, 30000);

    return () => clearInterval(interval);
  }, [projectId]);

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
      setData((prev) => prev ? { ...prev, project: json.project } : null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    setActionLoading("delete");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      window.location.href = "/projects";
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-zinc-500">Loading project...</div>
      </div>
    );
  }

  if (error || !data?.project) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-6">
            <p className="text-red-700">{error || "Project not found"}</p>
            <Link href="/projects" className="mt-4 inline-block text-sm text-red-600 hover:underline">
              ← Back to Projects
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { project, teams, sprints, tasks, stats } = data;
  const agents = Array.from(agentsById.values());

  return (
    <div className="space-y-6">
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Delete this project?</h3>
            <p className="mt-2 text-sm text-zinc-600">This cannot be undone.</p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading === "delete"}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === "delete" ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Link href="/projects" className="text-zinc-400 hover:text-zinc-600">←</Link>
            <h1 className="text-xl font-semibold text-zinc-900 truncate">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
            {project.type && <span className="capitalize">{project.type}</span>}
            <span>Progress: {project.progress_pct}%</span>
            <span>Updated {new Date(project.updated_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {project.status === "active" ? (
            <button
              onClick={() => handleStatusChange("paused")}
              disabled={actionLoading === "paused"}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {actionLoading === "paused" ? "Pausing..." : "Pause"}
            </button>
          ) : project.status === "paused" ? (
            <button
              onClick={() => handleStatusChange("active")}
              disabled={actionLoading === "active"}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading === "active" ? "Resuming..." : "Resume"}
            </button>
          ) : null}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-zinc-200">
          <CardContent className="py-3">
            <div className="text-xs text-zinc-500">Tasks</div>
            <div className="text-xl font-semibold">{stats.totalTasks}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-200">
          <CardContent className="py-3">
            <div className="text-xs text-zinc-500">In Progress</div>
            <div className="text-xl font-semibold text-blue-600">{stats.inProgressTasks}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-200">
          <CardContent className="py-3">
            <div className="text-xs text-zinc-500">Done</div>
            <div className="text-xl font-semibold text-green-600">{stats.doneTasks}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-200">
          <CardContent className="py-3">
            <div className="text-xs text-zinc-500">Blocked</div>
            <div className="text-xl font-semibold text-red-600">{stats.blockedTasks}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Teams */}
        <div className="lg:col-span-1">
          <Card className="border-zinc-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Teams</CardTitle>
            </CardHeader>
            <CardContent>
              {teams.length === 0 ? (
                <p className="text-sm text-zinc-500">No teams assigned</p>
              ) : (
                <div className="space-y-3">
                  {teams.map((team: any) => (
                    <div key={team.id} className="rounded-lg border border-zinc-100 p-3">
                      <div className="flex items-center gap-2">
                        <TeamStatusDot status={team.status} />
                        <span className="font-medium text-zinc-900">{team.name}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="text-xs text-zinc-500">{team.activeAgents || 0} active</span>
                        <span className="text-xs text-zinc-500">{team.taskCount || 0} tasks</span>
                        {team.blockedTasks > 0 && (
                          <span className="text-xs text-red-600">{team.blockedTasks} blocked</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Sprints & Tasks */}
        <div className="space-y-6 lg:col-span-2">
          {/* Sprints */}
          <Card className="border-zinc-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Sprints</CardTitle>
                <button className="text-xs text-red-600 hover:underline">+ Create Sprint</button>
              </div>
            </CardHeader>
            <CardContent>
              {sprints.length === 0 ? (
                <p className="text-sm text-zinc-500">No sprints yet</p>
              ) : (
                <div className="space-y-3">
                  {sprints.map((sprint: any) => (
                    <div key={sprint.id} className="rounded-lg border border-zinc-100 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-zinc-900">{sprint.name}</span>
                          {sprint.goal && <span className="ml-2 text-xs text-zinc-500">- {sprint.goal}</span>}
                        </div>
                        <TaskStatusBadge status={sprint.status === "active" ? "in_progress" : sprint.status === "completed" ? "done" : "todo"} />
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                        {sprint.start_date && <span>{sprint.start_date}</span>}
                        {sprint.end_date && <span>→ {sprint.end_date}</span>}
                        <span>{sprint.progress_pct}% complete</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card className="border-zinc-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Tasks</CardTitle>
                <button className="text-xs text-red-600 hover:underline">+ New Task</button>
              </div>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-zinc-500">No tasks yet</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task: any) => {
                    const assignee = task.assignee_agent_id ? agentsById.get(task.assignee_agent_id) : null;
                    return (
                      <div key={task.id} className="flex items-center justify-between rounded-lg border border-zinc-100 p-2">
                        <div className="min-w-0">
                          <span className="text-sm text-zinc-900 truncate">{task.title}</span>
                          {assignee && (
                            <span className="ml-2 text-xs text-zinc-500">@{assignee.name}</span>
                          )}
                        </div>
                        <TaskStatusBadge status={task.status} />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

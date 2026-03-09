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
  events: any[];
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
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [newSprintName, setNewSprintName] = useState("");
  const [newSprintGoal, setNewSprintGoal] = useState("");

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

  // Subscribe to realtime updates for this project (live progress)
  useEffect(() => {
    // Refetch every 10 seconds for live progress updates
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {}
    }, 10000);

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

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      const activeSprint = sprints.find((s: any) => s.status === "active");
      if (!activeSprint) throw new Error("No active sprint");
      
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: newTaskTitle, 
          sprint_id: activeSprint.id 
        }),
      });
      if (!res.ok) throw new Error("Failed to create task");
      
      setNewTaskTitle("");
      setNewTaskDesc("");
      setShowTaskModal(false);
      // Refresh data
      const json = await fetch(`/api/projects/${projectId}`).then(r => r.json());
      setData(json);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleUpdateTaskDesc = async () => {
    if (!selectedTask || !taskDesc.trim()) return;
    try {
      await fetch(`/api/projects/${projectId}/tasks/${selectedTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: taskDesc }),
      });
      
      setShowTaskModal(false);
      const json = await fetch(`/api/projects/${projectId}`).then(r => r.json());
      setData(json);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleCreateSprint = async () => {
    if (!newSprintName.trim()) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newSprintName, 
          goal: newSprintGoal || "Sprint goals",
          start_date: new Date().toISOString().split("T")[0],
          end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        }),
      });
      if (!res.ok) throw new Error("Failed to create sprint");
      
      setNewSprintName("");
      setNewSprintGoal("");
      setShowSprintModal(false);
      // Refresh data
      const json = await fetch(`/api/projects/${projectId}`).then(r => r.json());
      setData(json);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleTaskClick = (task: any) => {
    setSelectedTask(task);
    setTaskDesc(task.description || "");
    setShowTaskModal(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-4">
        <div className="h-8 w-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
        <div className="text-zinc-500">Loading project...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-6">
            <div className="flex items-center gap-2 text-red-700 font-medium">
              <span className="text-xl">⚠️</span>
              <p>Error loading project</p>
            </div>
            <p className="mt-2 text-sm text-red-600">{error}</p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
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
    return (
      <div className="p-6">
        <Card className="border-zinc-200">
          <CardContent className="py-6">
            <div className="flex items-center gap-2 text-zinc-700 font-medium">
              <span className="text-xl">🔍</span>
              <p>Project not found</p>
            </div>
            <p className="mt-2 text-sm text-zinc-500">The project you&apos;re looking for doesn&apos;t exist or has been deleted.</p>
            <Link href="/projects" className="mt-4 inline-block text-sm text-red-600 hover:underline">
              ← Back to Projects
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { project, teams, sprints, tasks, events, stats } = data;
  const agents = Array.from(agentsById.values());

  return (
    <div className="space-y-6 overflow-x-hidden">
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href="/projects" className="text-zinc-400 hover:text-zinc-600">←</Link>
            <h1 className="text-lg sm:text-xl font-semibold text-zinc-900 truncate">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-zinc-500">
            {project.type && <span className="capitalize">{project.type}</span>}
            <span>{project.progress_pct}%</span>
            <span>{new Date(project.updated_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project.status === "active" ? (
            <button
              onClick={() => handleStatusChange("paused")}
              disabled={actionLoading === "paused"}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {actionLoading === "paused" ? "..." : "Pause"}
            </button>
          ) : project.status === "paused" ? (
            <button
              onClick={() => handleStatusChange("active")}
              disabled={actionLoading === "active"}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading === "active" ? "..." : "Resume"}
            </button>
          ) : project.status === "completed" && project.type !== "marketing" ? (
            <button
              onClick={() => window.location.href = "/campaigns"}
              className="rounded-md bg-purple-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-purple-700"
            >
              Launch Campaign
            </button>
          ) : null}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-md border border-red-200 px-3 py-1.5 text-xs sm:text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-zinc-500">
          <span>Progress</span>
          <span>{stats.totalTasks > 0 ? Math.round((stats.doneTasks / stats.totalTasks) * 100) : 0}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
            style={{ width: `${stats.totalTasks > 0 ? (stats.doneTasks / stats.totalTasks) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-zinc-200">
          <CardContent className="py-2 sm:py-3">
            <div className="text-[10px] sm:text-xs text-zinc-500">Tasks</div>
            <div className="text-lg sm:text-xl font-semibold">{stats.totalTasks}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-200">
          <CardContent className="py-2 sm:py-3">
            <div className="text-[10px] sm:text-xs text-zinc-500">In Progress</div>
            <div className="text-lg sm:text-xl font-semibold text-blue-600">{stats.inProgressTasks}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-200">
          <CardContent className="py-2 sm:py-3">
            <div className="text-[10px] sm:text-xs text-zinc-500">Done</div>
            <div className="text-lg sm:text-xl font-semibold text-green-600">{stats.doneTasks}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-200">
          <CardContent className="py-2 sm:py-3">
            <div className="text-[10px] sm:text-xs text-zinc-500">Blocked</div>
            <div className="text-lg sm:text-xl font-semibold text-red-600">{stats.blockedTasks}</div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Timeline */}
      <Card className="border-zinc-200">
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="text-xs sm:text-sm">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-xs sm:text-sm text-zinc-500">No activity yet</p>
          ) : (
            <div className="space-y-3">
              {events.map((event: any) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <div className="w-px flex-1 bg-zinc-200" />
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-medium text-zinc-900">
                        {event.event_type.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </span>
                      <span className="text-[10px] sm:text-xs text-zinc-400">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {event.payload && Object.keys(event.payload).length > 0 && (
                      <p className="mt-1 text-[10px] sm:text-xs text-zinc-500">
                        {JSON.stringify(event.payload).slice(0, 100)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {/* Left: Teams */}
        <div className="lg:col-span-1">
          <Card className="border-zinc-200">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm">Teams</CardTitle>
            </CardHeader>
            <CardContent>
              {teams.length === 0 ? (
                <p className="text-xs sm:text-sm text-zinc-500">No teams assigned</p>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {teams.map((team: any) => (
                    <div key={team.id} className="rounded-lg border border-zinc-100 p-2 sm:p-3">
                      <div className="flex items-center gap-2">
                        <TeamStatusDot status={team.status} />
                        <span className="text-xs sm:text-sm font-medium text-zinc-900 truncate">{team.name}</span>
                      </div>
                      <div className="mt-1 sm:mt-2 flex flex-wrap gap-1 sm:gap-2">
                        <span className="text-[10px] sm:text-xs text-zinc-500">{team.activeAgents || 0} active</span>
                        <span className="text-[10px] sm:text-xs text-zinc-500">{team.taskCount || 0} tasks</span>
                        {team.blockedTasks > 0 && (
                          <span className="text-[10px] sm:text-xs text-red-600">{team.blockedTasks} blocked</span>
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
        <div className="space-y-4 lg:space-y-6 lg:col-span-2">
          {/* Sprints */}
          <Card className="border-zinc-200">
            <CardHeader className="pb-2 sm:pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm">Sprints</CardTitle>
                <button onClick={() => setShowSprintModal(true)} className="text-[10px] sm:text-xs text-red-600 hover:underline">+ Create</button>
              </div>
            </CardHeader>
            <CardContent>
              {sprints.length === 0 ? (
                <p className="text-xs sm:text-sm text-zinc-500">No sprints yet</p>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {sprints.map((sprint: any) => (
                    <div key={sprint.id} className="rounded-lg border border-zinc-100 p-2 sm:p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-xs sm:text-sm font-medium text-zinc-900 truncate">{sprint.name}</span>
                          {sprint.goal && <span className="ml-1 sm:ml-2 text-[10px] sm:text-xs text-zinc-500 line-clamp-1">- {sprint.goal}</span>}
                        </div>
                        <TaskStatusBadge status={sprint.status === "active" ? "in_progress" : sprint.status === "completed" ? "done" : "todo"} />
                      </div>
                      <div className="mt-1 sm:mt-2 flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-zinc-500">
                        {sprint.start_date && <span className="truncate">{sprint.start_date}</span>}
                        {sprint.end_date && <span className="truncate">→ {sprint.end_date}</span>}
                        <span>{sprint.progress_pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card className="border-zinc-200">
            <CardHeader className="pb-2 sm:pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm">Tasks</CardTitle>
                <button onClick={() => { setSelectedTask(null); setShowTaskModal(true); }} className="text-[10px] sm:text-xs text-red-600 hover:underline">+ New</button>
              </div>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-xs sm:text-sm text-zinc-500">No tasks yet</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task: any) => {
                    const assignee = task.assignee_agent_id ? agentsById.get(task.assignee_agent_id) : null;
                    return (
                      <div 
                        key={task.id} 
                        onClick={() => handleTaskClick(task)}
                        className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 p-2 cursor-pointer hover:bg-zinc-50"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-xs sm:text-sm text-zinc-900 truncate block">{task.title}</span>
                          {assignee && (
                            <span className="text-[10px] sm:text-xs text-zinc-500">@{assignee.name}</span>
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

      {/* Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowTaskModal(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-zinc-900">
              {selectedTask ? "Task Details" : "New Task"}
            </h3>
            
            {selectedTask ? (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Task</label>
                  <p className="text-sm font-medium text-zinc-900">{selectedTask.title}</p>
                  <p className="text-xs text-zinc-500 mt-1">Status: {selectedTask.status?.replace("_", " ")} • Assigned to: {selectedTask.assignee_agent_id ? agentsById.get(selectedTask.assignee_agent_id)?.name : "AI"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Description / Directions</label>
                  <textarea 
                    value={taskDesc}
                    onChange={e => setTaskDesc(e.target.value)}
                    placeholder="Add notes or directions for the AI..."
                    rows={4}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Task Name</label>
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    placeholder="What needs to be done..."
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Description</label>
                  <textarea
                    value={newTaskDesc}
                    onChange={e => setNewTaskDesc(e.target.value)}
                    placeholder="Details for the AI..."
                    rows={3}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
            
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowTaskModal(false)}
                className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={selectedTask ? handleUpdateTaskDesc : handleCreateTask}
                disabled={selectedTask ? false : !newTaskTitle.trim()}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {selectedTask ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sprint Modal */}
      {showSprintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSprintModal(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-zinc-900">New Sprint</h3>
            
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">Sprint Name</label>
                <input
                  type="text"
                  value={newSprintName}
                  onChange={e => setNewSprintName(e.target.value)}
                  placeholder="e.g., Sprint 3"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Goal</label>
                <input
                  type="text"
                  value={newSprintGoal}
                  onChange={e => setNewSprintGoal(e.target.value)}
                  placeholder="Sprint goal..."
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowSprintModal(false)}
                className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSprint}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TASK_TYPE_CONFIG,
  generateTaskTitle,
  getRoutingPreview,
  getTaskTypeConfig,
  humanizeTaskValue,
  type TaskType,
} from "@/lib/task-model";

export type StructuredTaskPayload = {
  sprint_id?: string;
  task_type: TaskType;
  task_goal: string;
  task_metadata: Record<string, string>;
  context_note?: string;
  review_required: boolean;
  title_override?: string;
  follow_up_intent?: FollowUpIntent;
  revision_source_task_id?: string;
  revision_source_task_title?: string;
};

type FollowUpIntent = "revise_delivered_work" | "add_deliverable" | "add_support_work";

type ModalMilestone = {
  id: string;
  name: string;
  status?: string;
  category?: "bootstrap" | "delivery";
  totalTasks?: number;
  doneTasks?: number;
};

type ModalTask = {
  id: string;
  title: string;
  sprint_id?: string | null;
  status?: string;
  task_type?: string | null;
};

const INTENT_OPTIONS: Array<{
  value: FollowUpIntent;
  label: string;
  description: string;
}> = [
  {
    value: "revise_delivered_work",
    label: "Revise delivered work",
    description: "Target something already delivered, then open a clearly scoped revision task.",
  },
  {
    value: "add_deliverable",
    label: "Add deliverable",
    description: "Create a new deliverable with the right work type and milestone context.",
  },
  {
    value: "add_support_work",
    label: "Add support work",
    description: "Queue planning, QA, or internal support work that helps delivery move forward.",
  },
];

const INTENT_TASK_TYPES: Record<FollowUpIntent, TaskType[]> = {
  revise_delivered_work: ["design", "build_implementation", "content_messaging"],
  add_deliverable: ["design", "build_implementation", "content_messaging"],
  add_support_work: ["discovery_plan", "qa_validation", "internal_admin"],
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function buildIntentCopy(intent: FollowUpIntent | null) {
  switch (intent) {
    case "revise_delivered_work":
      return {
        title: "Revise delivered work",
        description: "Pick the delivered item this revision belongs to, then scope the next pass without treating it like a brand-new deliverable.",
        submitLabel: "Create revision task",
        detailsLabel: "Revision task details",
      };
    case "add_deliverable":
      return {
        title: "Add deliverable",
        description: "Choose the milestone this new deliverable belongs to, then define the structured work that should be added.",
        submitLabel: "Add deliverable work",
        detailsLabel: "Deliverable details",
      };
    case "add_support_work":
      return {
        title: "Add support work",
        description: "Create planning, QA, or coordination work that supports the project without changing the deliverable framing.",
        submitLabel: "Add support work",
        detailsLabel: "Support work details",
      };
    default:
      return {
        title: "Add project follow-up work",
        description: "Start by choosing the kind of follow-up you need so the next form can stay project-aware.",
        submitLabel: "Add follow-up work",
        detailsLabel: "Follow-up work details",
      };
  }
}

export function StructuredTaskModal({
  open,
  onClose,
  onCreate,
  creating,
  milestones,
  tasks,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: StructuredTaskPayload) => Promise<void>;
  creating?: boolean;
  milestones?: ModalMilestone[];
  tasks?: ModalTask[];
}) {
  const [intent, setIntent] = useState<FollowUpIntent | null>(null);
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [taskGoal, setTaskGoal] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [reviewRequired, setReviewRequired] = useState(true);
  const [titleOverride, setTitleOverride] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [selectedRevisionTaskId, setSelectedRevisionTaskId] = useState("");

  const deliveryMilestones = useMemo(() => (milestones ?? []).filter((milestone) => milestone.category !== "bootstrap"), [milestones]);
  const revisionCandidateTasks = useMemo(() => {
    const taskMilestones = new Map((milestones ?? []).map((milestone) => [milestone.id, milestone]));
    return (tasks ?? []).filter((task) => {
      if (task.status !== "done") return false;
      if (!task.task_type || !INTENT_TASK_TYPES.revise_delivered_work.includes(task.task_type as TaskType)) return false;
      const milestone = task.sprint_id ? taskMilestones.get(task.sprint_id) : null;
      return milestone?.category !== "bootstrap";
    });
  }, [milestones, tasks]);

  const selectedRevisionTask = useMemo(
    () => revisionCandidateTasks.find((task) => task.id === selectedRevisionTaskId) ?? null,
    [revisionCandidateTasks, selectedRevisionTaskId],
  );

  const selectedMilestone = useMemo(
    () => deliveryMilestones.find((milestone) => milestone.id === selectedMilestoneId) ?? null,
    [deliveryMilestones, selectedMilestoneId],
  );

  const availableTaskTypes = useMemo(() => (intent ? INTENT_TASK_TYPES[intent] : []), [intent]);
  const config = useMemo(() => (taskType ? getTaskTypeConfig(taskType) : null), [taskType]);
  const routing = useMemo(() => (taskType ? getRoutingPreview(taskType) : null), [taskType]);
  const generatedTitle = useMemo(() => (taskType ? generateTaskTitle(taskType, taskGoal, metadata) : ""), [taskType, taskGoal, metadata]);
  const intentCopy = useMemo(() => buildIntentCopy(intent), [intent]);

  useEffect(() => {
    if (!config) {
      setMetadata({});
      return;
    }

    const nextMetadata: Record<string, string> = {};
    for (const field of config.metadataFields) {
      nextMetadata[field.key] = field.options[0]?.value || "";
    }
    setMetadata(nextMetadata);
    setReviewRequired(config.reviewRequired);
  }, [config]);

  useEffect(() => {
    if (!intent) {
      setTaskType(null);
      return;
    }
    if (taskType && availableTaskTypes.includes(taskType)) return;
    setTaskType(availableTaskTypes[0] ?? null);
  }, [availableTaskTypes, intent, taskType]);

  useEffect(() => {
    if (!intent) {
      setSelectedMilestoneId("");
      setSelectedRevisionTaskId("");
      return;
    }

    if (intent === "revise_delivered_work") {
      const firstRevisionTask = revisionCandidateTasks[0] ?? null;
      setSelectedRevisionTaskId((current) => (current && revisionCandidateTasks.some((task) => task.id === current) ? current : firstRevisionTask?.id ?? ""));
      setSelectedMilestoneId(firstRevisionTask?.sprint_id ?? "");
      return;
    }

    const firstMilestone = deliveryMilestones[0] ?? null;
    setSelectedMilestoneId((current) => (current && deliveryMilestones.some((milestone) => milestone.id === current) ? current : firstMilestone?.id ?? ""));
    setSelectedRevisionTaskId("");
  }, [deliveryMilestones, intent, revisionCandidateTasks]);

  useEffect(() => {
    if (!selectedRevisionTask) return;
    setSelectedMilestoneId(selectedRevisionTask.sprint_id ?? "");
  }, [selectedRevisionTask]);

  useEffect(() => {
    if (!open) {
      setIntent(null);
      setTaskType(null);
      setTaskGoal("");
      setContextNote("");
      setTitleOverride("");
      setMetadata({});
      setShowDetails(false);
      setSelectedMilestoneId("");
      setSelectedRevisionTaskId("");
    }
  }, [open]);

  if (!open) return null;

  const needsMilestone = intent === "add_deliverable";
  const needsRevisionTarget = intent === "revise_delivered_work";
  const hasIntentPrereqs = needsRevisionTarget ? Boolean(selectedRevisionTask) : needsMilestone ? Boolean(selectedMilestoneId) : true;
  const canSubmit = Boolean(intent && taskType && config && hasIntentPrereqs && taskGoal.trim().length > 0 && config.metadataFields.every((field) => Boolean(metadata[field.key])));

  const submitPayload = () => {
    if (!taskType || !intent) return;

    const autoContext: string[] = [];
    if (intent === "revise_delivered_work" && selectedRevisionTask) {
      autoContext.push(`Revision target: ${selectedRevisionTask.title}`);
      if (selectedMilestone?.name) autoContext.push(`Existing delivered milestone: ${selectedMilestone.name}`);
      autoContext.push("Lineage note: keep this work connected to the delivered item above.");
    }
    if (intent === "add_deliverable" && selectedMilestone?.name) {
      autoContext.push(`Milestone context: ${selectedMilestone.name}`);
    }
    if (intent === "add_support_work" && selectedMilestone?.name) {
      autoContext.push(`Related milestone: ${selectedMilestone.name}`);
    }

    const combinedContext = [...autoContext, contextNote.trim()].filter(Boolean).join("\n\n");

    onCreate({
      sprint_id: selectedMilestoneId || undefined,
      task_type: taskType,
      task_goal: taskGoal,
      task_metadata: metadata,
      context_note: combinedContext || undefined,
      review_required: reviewRequired,
      title_override: titleOverride.trim() || undefined,
      follow_up_intent: intent,
      revision_source_task_id: intent === "revise_delivered_work" ? selectedRevisionTask?.id : undefined,
      revision_source_task_title: intent === "revise_delivered_work" ? selectedRevisionTask?.title : undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(75dvh,48rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-xl sm:max-h-[90vh] sm:rounded-2xl sm:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200/80 px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">{intentCopy.title}</h3>
            <p className="mt-1 text-sm text-zinc-500">{intentCopy.description}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600" aria-label="Close create task modal">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:py-5">
          <section>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-zinc-900">Follow-up intent</p>
              {intent ? (
                <button type="button" onClick={() => setIntent(null)} className="text-xs font-medium text-red-600 hover:text-red-700">
                  Change
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {INTENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setIntent(option.value)}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left transition",
                    option.value === intent ? "border-red-400 bg-red-50" : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                  )}
                >
                  <div className="text-sm font-medium text-zinc-900">{option.label}</div>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{option.description}</p>
                </button>
              ))}
            </div>
          </section>

          {intent ? (
            <>
              {intent === "revise_delivered_work" ? (
                <section className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">Delivered work to revise</p>
                      <p className="mt-1 text-xs text-zinc-500">This keeps the new task anchored to work that already shipped through the project flow.</p>
                    </div>
                  </div>
                  {revisionCandidateTasks.length > 0 ? (
                    <label className="mt-3 block">
                      <span className="mb-1 block text-sm font-medium text-zinc-700">Existing delivered item</span>
                      <select
                        value={selectedRevisionTaskId}
                        onChange={(e) => setSelectedRevisionTaskId(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      >
                        {revisionCandidateTasks.map((task) => {
                          const milestoneName = deliveryMilestones.find((milestone) => milestone.id === task.sprint_id)?.name;
                          return (
                            <option key={task.id} value={task.id}>
                              {task.title}{milestoneName ? ` · ${milestoneName}` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  ) : (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                      No completed delivered work is available yet, so the revision path is UI-only for now. Ship a deliverable first, then open a revision from here.
                    </div>
                  )}
                </section>
              ) : null}

              {intent !== "revise_delivered_work" ? (
                <section className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 sm:p-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{intent === "add_deliverable" ? "Milestone context" : "Related milestone"}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {intent === "add_deliverable"
                        ? "Attach the new deliverable to the milestone it belongs to."
                        : "Optional milestone context helps support work stay connected to delivery."}
                    </p>
                  </div>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-sm font-medium text-zinc-700">{intent === "add_deliverable" ? "Milestone" : "Milestone (optional)"}</span>
                    <select
                      value={selectedMilestoneId}
                      onChange={(e) => setSelectedMilestoneId(e.target.value)}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    >
                      {intent === "add_support_work" ? <option value="">No specific milestone</option> : null}
                      {deliveryMilestones.map((milestone) => (
                        <option key={milestone.id} value={milestone.id}>
                          {milestone.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
              ) : null}

              <section>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-900">Structured task type</p>
                  {taskType ? (
                    <button type="button" onClick={() => setTaskType(null)} className="text-xs font-medium text-red-600 hover:text-red-700">
                      Change
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {availableTaskTypes.map((type) => {
                    const item = TASK_TYPE_CONFIG[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setTaskType(type)}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-left transition",
                          type === taskType ? "border-red-400 bg-red-50" : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                        )}
                      >
                        <div className="text-sm font-medium text-zinc-900">{item.label}</div>
                        <p className="mt-0.5 text-xs text-zinc-500">{item.description}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}

          {intent && taskType && config ? (
            <>
              <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-1 font-medium text-zinc-700">{config.label}</span>
                  {routing ? <span className="rounded-full bg-white px-2.5 py-1 font-medium text-zinc-500">{routing.ownerTeamLabel} → {routing.qcTeamLabel}</span> : null}
                  {selectedMilestone?.name ? <span className="rounded-full bg-white px-2.5 py-1 font-medium text-zinc-500">Milestone: {selectedMilestone.name}</span> : null}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">{config.goalLabel || "What follow-up outcome should this work item accomplish?"}</label>
                  <input
                    value={taskGoal}
                    onChange={(e) => setTaskGoal(e.target.value)}
                    placeholder={
                      intent === "revise_delivered_work"
                        ? `Describe the revision needed for ${selectedRevisionTask?.title || "the delivered work"}`
                        : config.goalPlaceholder || "Describe the outcome"
                    }
                    className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm"
                  />
                </div>
                {intent === "revise_delivered_work" && selectedRevisionTask ? (
                  <div className="rounded-xl border border-red-100 bg-white px-3 py-3 text-sm text-zinc-700">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-red-600">Revision lineage</div>
                    <p className="mt-1">This task will reference <span className="font-medium text-zinc-900">{selectedRevisionTask.title}</span>{selectedMilestone?.name ? ` in ${selectedMilestone.name}` : ""} so the UI clearly reads as a revision, not a generic new work item.</p>
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowDetails((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  aria-expanded={showDetails}
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{intentCopy.detailsLabel}</p>
                    <p className="text-xs text-zinc-500">Type options, project context, review settings, and title override.</p>
                  </div>
                  <span className="text-xs font-medium text-zinc-500">{showDetails ? "Hide" : "Show"}</span>
                </button>

                {showDetails ? (
                  <div className="space-y-4 border-t border-zinc-200 px-4 py-4">
                    <section className="grid gap-4 sm:grid-cols-2">
                      {config.metadataFields.map((field) => (
                        <label key={field.key} className="block">
                          <span className="mb-1 block text-sm font-medium text-zinc-700">{field.label}</span>
                          <select
                            value={metadata[field.key] || ""}
                            onChange={(e) => setMetadata((current) => ({ ...current, [field.key]: e.target.value }))}
                            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                          >
                            {field.options.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </section>

                    <div>
                      <label className="block text-sm font-medium text-zinc-700">Supporting context</label>
                      <textarea value={contextNote} onChange={(e) => setContextNote(e.target.value)} rows={3} placeholder="References, acceptance notes, revision instructions, or constraints…" className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700">Title override</label>
                        <input value={titleOverride} onChange={(e) => setTitleOverride(e.target.value)} placeholder={generatedTitle} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                        <p className="mt-1 text-xs text-zinc-500">Default: {generatedTitle}</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-zinc-700">
                        <input type="checkbox" checked={reviewRequired} onChange={(e) => setReviewRequired(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
                        Review required
                      </label>
                    </div>

                    <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
                      {config.metadataFields.map((field) => (
                        <div key={field.key} className="rounded-lg bg-zinc-50 px-3 py-2">
                          <span className="font-medium text-zinc-700">{field.label}:</span> {humanizeTaskValue(metadata[field.key] || "")}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-zinc-200/80 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:flex-row sm:px-6 sm:py-5">
          <button onClick={onClose} className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
          <button
            onClick={submitPayload}
            disabled={!canSubmit || creating}
            className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {creating ? "Adding work..." : intentCopy.submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

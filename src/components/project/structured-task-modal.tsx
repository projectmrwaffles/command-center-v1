"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CREATE_ENABLED_TASK_TYPES,
  TASK_TYPE_CONFIG,
  generateTaskTitle,
  getRoutingPreview,
  getTaskTypeConfig,
  humanizeTaskValue,
  type TaskType,
} from "@/lib/task-model";

export type StructuredTaskPayload = {
  task_type: TaskType;
  task_goal: string;
  task_metadata: Record<string, string>;
  context_note?: string;
  review_required: boolean;
  title_override?: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function StructuredTaskModal({
  open,
  onClose,
  onCreate,
  creating,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: StructuredTaskPayload) => Promise<void>;
  creating?: boolean;
}) {
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [taskGoal, setTaskGoal] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [reviewRequired, setReviewRequired] = useState(true);
  const [titleOverride, setTitleOverride] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const config = useMemo(() => (taskType ? getTaskTypeConfig(taskType) : null), [taskType]);
  const routing = useMemo(() => (taskType ? getRoutingPreview(taskType) : null), [taskType]);
  const generatedTitle = useMemo(() => (taskType ? generateTaskTitle(taskType, taskGoal, metadata) : ""), [taskType, taskGoal, metadata]);

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
    if (!open) {
      setTaskType(null);
      setTaskGoal("");
      setContextNote("");
      setTitleOverride("");
      setMetadata({});
      setShowDetails(false);
    }
  }, [open]);

  if (!open) return null;

  const canSubmit = Boolean(taskType && config && taskGoal.trim().length > 0 && config.metadataFields.every((field) => Boolean(metadata[field.key])));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:max-h-[90vh] sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Create task</h3>
            <p className="mt-1 text-sm text-zinc-500">Pick a type, then describe the outcome.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600" aria-label="Close create task modal">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <section>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-zinc-900">Task type</p>
              {taskType ? (
                <button type="button" onClick={() => setTaskType(null)} className="text-xs font-medium text-red-600 hover:text-red-700">
                  Change
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {CREATE_ENABLED_TASK_TYPES.map((type) => {
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

          {taskType && config ? (
            <>
              <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-1 font-medium text-zinc-700">{config.label}</span>
                  {routing ? <span className="rounded-full bg-white px-2.5 py-1 font-medium text-zinc-500">{routing.ownerTeamLabel} → {routing.qcTeamLabel}</span> : null}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">{config.goalLabel || "What should this task accomplish?"}</label>
                  <input
                    value={taskGoal}
                    onChange={(e) => setTaskGoal(e.target.value)}
                    placeholder={config.goalPlaceholder || "Describe the outcome"}
                    className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm"
                  />
                </div>
              </section>

              <section className="rounded-xl border border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowDetails((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  aria-expanded={showDetails}
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">More details</p>
                    <p className="text-xs text-zinc-500">Type options, context, review settings, and title override.</p>
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
                      <textarea value={contextNote} onChange={(e) => setContextNote(e.target.value)} rows={3} placeholder="References, acceptance notes, or constraints…" className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
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

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
          <button onClick={onClose} className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
          <button
            onClick={() => {
              if (!taskType) return;
              onCreate({ task_type: taskType, task_goal: taskGoal, task_metadata: metadata, context_note: contextNote, review_required: reviewRequired, title_override: titleOverride.trim() || undefined });
            }}
            disabled={!canSubmit || creating}
            className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}

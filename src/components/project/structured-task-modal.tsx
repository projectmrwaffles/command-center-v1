"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TASK_TYPE_CONFIG,
  TASK_TYPES,
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
  const [taskType, setTaskType] = useState<TaskType>("build_implementation");
  const [taskGoal, setTaskGoal] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [reviewRequired, setReviewRequired] = useState(true);
  const [titleOverride, setTitleOverride] = useState("");

  const config = useMemo(() => getTaskTypeConfig(taskType), [taskType]);
  const routing = useMemo(() => getRoutingPreview(taskType), [taskType]);
  const generatedTitle = useMemo(() => generateTaskTitle(taskType, taskGoal, metadata), [taskType, taskGoal, metadata]);

  useEffect(() => {
    const nextMetadata: Record<string, string> = {};
    for (const field of config.metadataFields) {
      nextMetadata[field.key] = field.options[0]?.value || "";
    }
    setMetadata(nextMetadata);
    setReviewRequired(config.reviewRequired);
  }, [config]);

  useEffect(() => {
    if (!open) {
      setTaskType("build_implementation");
      setTaskGoal("");
      setContextNote("");
      setTitleOverride("");
    }
  }, [open]);

  if (!open) return null;

  const canSubmit = taskGoal.trim().length > 0 && config.metadataFields.every((field) => Boolean(metadata[field.key]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-zinc-900">Create structured task</h3>
        <p className="mt-1 text-sm text-zinc-500">Start with the kind of task, then fill only the fields that matter for this slice.</p>

        <div className="mt-5 space-y-5">
          <section>
            <p className="text-sm font-medium text-zinc-900">1. What kind of task is this?</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {TASK_TYPES.map((type) => {
                const item = TASK_TYPE_CONFIG[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTaskType(type)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition",
                      type === taskType ? "border-red-400 bg-red-50" : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                    )}
                  >
                    <div className="text-sm font-medium text-zinc-900">{item.label}</div>
                    <p className="mt-1 text-xs text-zinc-500">{item.description}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            {config.metadataFields.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-700">2. {field.label}</span>
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

          <section className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">3. What should this task accomplish?</label>
              <input value={taskGoal} onChange={(e) => setTaskGoal(e.target.value)} placeholder="e.g. mobile dashboard onboarding redesign" className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Optional supporting context</label>
              <textarea value={contextNote} onChange={(e) => setContextNote(e.target.value)} rows={3} placeholder="References, acceptance notes, or constraints…" className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">Owner: {routing.ownerTeamLabel}</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700">QC: {routing.qcTeamLabel}</span>
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", reviewRequired ? "bg-amber-50 text-amber-700" : "bg-zinc-200 text-zinc-700")}>{reviewRequired ? "Will enter review when submitted" : "No review loop by default"}</span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">{routing.rationale}</p>

            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <label className="block text-sm font-medium text-zinc-700">Generated title preview</label>
                <input value={titleOverride} onChange={(e) => setTitleOverride(e.target.value)} placeholder={generatedTitle} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                <p className="mt-1 text-xs text-zinc-500">Default: {generatedTitle}</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" checked={reviewRequired} onChange={(e) => setReviewRequired(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
                Review required
              </label>
            </div>

            <div className="mt-4 grid gap-2 text-xs text-zinc-500 md:grid-cols-2">
              {config.metadataFields.map((field) => (
                <div key={field.key} className="rounded-lg bg-white px-3 py-2">
                  <span className="font-medium text-zinc-700">{field.label}:</span> {humanizeTaskValue(metadata[field.key] || "")}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-6 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
          <button
            onClick={() => onCreate({ task_type: taskType, task_goal: taskGoal, task_metadata: metadata, context_note: contextNote, review_required: reviewRequired, title_override: titleOverride.trim() || undefined })}
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
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
  reference_document_ids?: string[];
  reference_document_titles?: string[];
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

type ProjectDocument = {
  id: string;
  title: string;
  type: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  created_at: string;
};

const DELIVERABLE_TASK_TYPES: TaskType[] = ["design", "build_implementation", "content_messaging"];
const SUPPORT_TASK_TYPES: TaskType[] = ["discovery_plan", "qa_validation", "internal_admin"];
const DEFAULT_TASK_TYPE: TaskType = "build_implementation";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function buildModalCopy(input: { taskType: TaskType | null; isRevision: boolean }) {
  if (input.isRevision) {
    return {
      title: "Add revision work",
      description: "Pick the delivered task to revise, describe the next pass, and attach the right reference files.",
      submitLabel: "Create revision task",
      detailsLabel: "Optional details",
    };
  }

  if (input.taskType && SUPPORT_TASK_TYPES.includes(input.taskType)) {
    return {
      title: "Add follow-up work",
      description: "Create support work with a clear outcome. Everything else can stay on defaults unless you need it.",
      submitLabel: "Add follow-up",
      detailsLabel: "Optional details",
    };
  }

  return {
    title: "Add follow-up work",
    description: "Start with the next outcome. Change the work type only if the default does not fit.",
    submitLabel: "Add follow-up",
    detailsLabel: "Optional details",
  };
}

export function StructuredTaskModal({
  projectId,
  open,
  onClose,
  onCreate,
  creating,
  milestones,
  tasks,
  documents,
  onDocumentsChanged,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onCreate: (payload: StructuredTaskPayload) => Promise<void>;
  creating?: boolean;
  milestones?: ModalMilestone[];
  tasks?: ModalTask[];
  documents?: ProjectDocument[];
  onDocumentsChanged?: () => void;
}) {
  const [taskType, setTaskType] = useState<TaskType | null>(DEFAULT_TASK_TYPE);
  const [taskGoal, setTaskGoal] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [reviewRequired, setReviewRequired] = useState(true);
  const [titleOverride, setTitleOverride] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [selectedRevisionTaskId, setSelectedRevisionTaskId] = useState("");
  const [isRevision, setIsRevision] = useState(false);
  const [showTaskTypePicker, setShowTaskTypePicker] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<ProjectDocument[]>(documents ?? []);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const deliveryMilestones = useMemo(() => (milestones ?? []).filter((milestone) => milestone.category !== "bootstrap"), [milestones]);
  const revisionCandidateTasks = useMemo(() => {
    const taskMilestones = new Map((milestones ?? []).map((milestone) => [milestone.id, milestone]));
    return (tasks ?? []).filter((task) => {
      if (task.status !== "done") return false;
      if (!task.task_type || !DELIVERABLE_TASK_TYPES.includes(task.task_type as TaskType)) return false;
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

  const selectedReferenceDocuments = useMemo(
    () => availableDocuments.filter((document) => selectedReferenceIds.includes(document.id)),
    [availableDocuments, selectedReferenceIds],
  );
  const selectedReferenceSummary = selectedReferenceDocuments.length === 0
    ? null
    : `${selectedReferenceDocuments.length} reference file${selectedReferenceDocuments.length === 1 ? "" : "s"} attached`;

  const config = useMemo(() => (taskType ? getTaskTypeConfig(taskType) : null), [taskType]);
  const routing = useMemo(() => (taskType ? getRoutingPreview(taskType) : null), [taskType]);
  const generatedTitle = useMemo(() => (taskType ? generateTaskTitle(taskType, taskGoal, metadata) : ""), [taskType, taskGoal, metadata]);
  const isDeliverableType = Boolean(taskType && DELIVERABLE_TASK_TYPES.includes(taskType));
  const followUpIntent: FollowUpIntent | null = isRevision
    ? "revise_delivered_work"
    : taskType
      ? isDeliverableType
        ? "add_deliverable"
        : "add_support_work"
      : null;
  const modalCopy = useMemo(() => buildModalCopy({ taskType, isRevision }), [isRevision, taskType]);

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
    if (!taskType || !isDeliverableType) {
      setIsRevision(false);
      setSelectedRevisionTaskId("");
    }
  }, [isDeliverableType, taskType]);

  useEffect(() => {
    if (!taskType) {
      setSelectedMilestoneId("");
      return;
    }

    if (isRevision) {
      const firstRevisionTask = revisionCandidateTasks[0] ?? null;
      setSelectedRevisionTaskId((current) => (current && revisionCandidateTasks.some((task) => task.id === current) ? current : firstRevisionTask?.id ?? ""));
      setSelectedMilestoneId(firstRevisionTask?.sprint_id ?? "");
      return;
    }

    if (isDeliverableType) {
      const firstMilestone = deliveryMilestones[0] ?? null;
      setSelectedMilestoneId((current) => (current && deliveryMilestones.some((milestone) => milestone.id === current) ? current : firstMilestone?.id ?? ""));
      return;
    }

    setSelectedMilestoneId("");
  }, [deliveryMilestones, isDeliverableType, isRevision, revisionCandidateTasks, taskType]);

  useEffect(() => {
    if (!selectedRevisionTask) return;
    setSelectedMilestoneId(selectedRevisionTask.sprint_id ?? "");
  }, [selectedRevisionTask]);

  useEffect(() => {
    setAvailableDocuments((documents ?? []).slice().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
  }, [documents]);

  useEffect(() => {
    if (!open) {
      setTaskType(DEFAULT_TASK_TYPE);
      setTaskGoal("");
      setContextNote("");
      setTitleOverride("");
      setMetadata({});
      setReviewRequired(true);
      setShowDetails(false);
      setSelectedMilestoneId("");
      setSelectedRevisionTaskId("");
      setIsRevision(false);
      setShowTaskTypePicker(false);
      setSelectedReferenceIds([]);
      setUploadStatus(null);
      setAvailableDocuments((documents ?? []).slice().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [documents, open]);

  if (!open) return null;

  const needsMilestone = Boolean(taskType && isDeliverableType && !isRevision);
  const needsRevisionTarget = isRevision;
  const hasTaskType = Boolean(taskType && config);
  const hasIntentPrereqs = needsRevisionTarget ? Boolean(selectedRevisionTask) : needsMilestone ? Boolean(selectedMilestoneId) : true;
  const canSubmit = Boolean(hasTaskType && followUpIntent && hasIntentPrereqs && taskGoal.trim().length > 0 && config?.metadataFields.every((field) => Boolean(metadata[field.key])));

  const toggleReferenceDocument = (documentId: string) => {
    setSelectedReferenceIds((current) => current.includes(documentId) ? current.filter((value) => value !== documentId) : [...current, documentId]);
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFiles(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      const res = await fetch(`/api/projects/${projectId}/documents/upload`, {
        method: "POST",
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to upload files");

      const uploadedDocuments = Array.isArray(payload.documents) ? payload.documents.filter(Boolean) as ProjectDocument[] : [];
      if (uploadedDocuments.length > 0) {
        setAvailableDocuments((current) => {
          const byId = new Map(current.map((document) => [document.id, document]));
          uploadedDocuments.forEach((document) => byId.set(document.id, document));
          return Array.from(byId.values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        });
        setSelectedReferenceIds((current) => Array.from(new Set([...current, ...uploadedDocuments.map((document) => document.id)])));
      }

      setUploadStatus("Files uploaded");
      onDocumentsChanged?.();
    } catch (error: any) {
      setUploadStatus(error?.message || "Failed to upload files");
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submitPayload = () => {
    if (!taskType || !followUpIntent) return;

    const autoContext: string[] = [];
    if (followUpIntent === "revise_delivered_work" && selectedRevisionTask) {
      autoContext.push(`Revision target: ${selectedRevisionTask.title}`);
      if (selectedMilestone?.name) autoContext.push(`Existing delivered milestone: ${selectedMilestone.name}`);
      autoContext.push("Lineage note: keep this work connected to the delivered item above.");
    }
    if (followUpIntent === "add_deliverable" && selectedMilestone?.name) {
      autoContext.push(`Milestone context: ${selectedMilestone.name}`);
    }
    if (followUpIntent === "add_support_work" && selectedMilestone?.name) {
      autoContext.push(`Related stage: ${selectedMilestone.name}`);
    }
    if (selectedReferenceDocuments.length > 0) {
      autoContext.push(`Reference files:\n${selectedReferenceDocuments.map((document) => `- ${document.title}`).join("\n")}`);
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
      follow_up_intent: followUpIntent,
      revision_source_task_id: followUpIntent === "revise_delivered_work" ? selectedRevisionTask?.id : undefined,
      revision_source_task_title: followUpIntent === "revise_delivered_work" ? selectedRevisionTask?.title : undefined,
      reference_document_ids: selectedReferenceDocuments.map((document) => document.id),
      reference_document_titles: selectedReferenceDocuments.map((document) => document.title),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(75dvh,48rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-panel shadow-xl sm:max-h-[90vh] sm:rounded-2xl sm:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <h3 className="text-lg font-semibold text-text">{modalCopy.title}</h3>
            <p className="mt-1 text-sm text-text-muted">{modalCopy.description}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-text-muted transition hover:bg-panel-elevated hover:text-text" aria-label="Close create task modal">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:py-5">
          <section>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-text">Work type</p>
              <button
                type="button"
                onClick={() => setShowTaskTypePicker((current) => !current)}
                className="text-xs font-medium text-red-600 transition hover:text-red-700"
              >
                {showTaskTypePicker ? "Hide choices" : "Change"}
              </button>
            </div>

            {taskType ? (
              <div className="mt-3 rounded-xl border border-border bg-panel-elevated/80 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-text">{config?.label}</div>
                  <span className="rounded-full border border-border bg-panel px-2 py-0.5 text-[11px] font-medium text-text-muted">
                    {isDeliverableType ? "Deliverable" : "Support"}
                  </span>
                  <span className="text-xs text-text-muted">Defaults applied automatically</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-text-muted">{config?.description}</p>
              </div>
            ) : null}

            {showTaskTypePicker ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Object.entries(TASK_TYPE_CONFIG).map(([type, item]) => {
                  const typedType = type as TaskType;
                  const isSelected = typedType === taskType;
                  const toneClass = isSelected
                    ? "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40"
                    : "border-border bg-panel hover:border-red-200 hover:bg-panel-elevated";
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setTaskType(typedType);
                        setShowTaskTypePicker(false);
                      }}
                      className={cn("rounded-xl border px-3 py-3 text-left transition", toneClass)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-text">{item.label}</div>
                        <span className="rounded-full border border-border bg-panel px-2 py-0.5 text-[11px] font-medium text-text-muted">
                          {DELIVERABLE_TASK_TYPES.includes(typedType) ? "Deliverable" : "Support"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-text-muted">{item.description}</p>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          {taskType && isDeliverableType ? (
            <section className="rounded-xl border border-border bg-panel-elevated/80 p-3 sm:p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isRevision}
                  onChange={(e) => setIsRevision(e.target.checked)}
                  disabled={revisionCandidateTasks.length === 0}
                  className="mt-0.5 h-4 w-4 rounded border-border bg-panel"
                />
                <span>
                  <span className="block text-sm font-medium text-text">This is a revision of delivered work</span>
                  <span className="mt-1 block text-xs text-text-muted">
                    {revisionCandidateTasks.length > 0
                      ? "Turn this on only when you need to attach the follow-up to something already delivered."
                      : "No completed deliverables are available to revise yet."}
                  </span>
                </span>
              </label>

              {isRevision ? (
                revisionCandidateTasks.length > 0 ? (
                  <label className="mt-3 block">
                    <span className="mb-1 block text-sm font-medium text-text-secondary">Delivered task</span>
                    <select
                      value={selectedRevisionTaskId}
                      onChange={(e) => setSelectedRevisionTaskId(e.target.value)}
                      className="w-full rounded-md border border-border bg-panel text-text px-3 py-2 text-sm"
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
                ) : null
              ) : deliveryMilestones.length > 0 ? (
                <label className="mt-3 block">
                  <span className="mb-1 block text-sm font-medium text-text-secondary">Stage</span>
                  <select
                    value={selectedMilestoneId}
                    onChange={(e) => setSelectedMilestoneId(e.target.value)}
                    className="w-full rounded-md border border-border bg-panel text-text px-3 py-2 text-sm"
                  >
                    {deliveryMilestones.map((milestone) => (
                      <option key={milestone.id} value={milestone.id}>
                        {milestone.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                  Add or unlock a delivery stage first, then attach this follow-up to it.
                </div>
              )}
            </section>
          ) : null}

          {taskType && config ? (
            <>
              <section className="space-y-3 rounded-xl border border-border bg-panel-elevated/80 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-border bg-panel px-2.5 py-1 font-medium text-text-secondary">{config.label}</span>
                  {routing ? <span className="rounded-full border border-border bg-panel px-2.5 py-1 font-medium text-text-muted">{routing.ownerTeamLabel} → {routing.qcTeamLabel}</span> : null}
                  {selectedMilestone?.name && !isRevision ? <span className="rounded-full border border-border bg-panel px-2.5 py-1 font-medium text-text-muted">Stage: {selectedMilestone.name}</span> : null}
                  {isRevision && selectedRevisionTask ? <span className="rounded-full border border-border bg-panel px-2.5 py-1 font-medium text-text-muted">Revision of: {selectedRevisionTask.title}</span> : null}
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary">{config.goalLabel || "What follow-up outcome should this work item accomplish?"}</label>
                  <input
                    value={taskGoal}
                    onChange={(e) => setTaskGoal(e.target.value)}
                    placeholder={
                      isRevision
                        ? `Describe the revision needed for ${selectedRevisionTask?.title || "the delivered work"}`
                        : config.goalPlaceholder || "Describe the outcome"
                    }
                    className="mt-1.5 w-full rounded-md border border-border bg-panel text-text px-3 py-2.5 text-sm"
                  />
                </div>
                {isRevision && selectedRevisionTask ? (
                  <div className="rounded-xl border border-red-100 bg-panel px-3 py-3 text-sm text-text-secondary dark:border-red-900/60 dark:bg-red-950/20">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-red-600 dark:text-red-300">Revision lineage</div>
                    <p className="mt-1">This task will stay linked to <span className="font-medium text-text">{selectedRevisionTask.title}</span>{selectedMilestone?.name ? ` in ${selectedMilestone.name}` : ""}.</p>
                  </div>
                ) : null}
                {selectedReferenceSummary ? (
                  <div className="rounded-xl border border-border bg-panel px-3 py-3 text-sm text-text-secondary">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Attached context</div>
                    <p className="mt-1">{selectedReferenceSummary}</p>
                    <p className="mt-2 text-xs text-text-muted">These file names will carry into the created task so the next pass keeps the right references.</p>
                  </div>
                ) : null}
              </section>

              {isRevision ? (
                <section className="rounded-xl border border-border bg-panel-elevated/80 p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-text">Reference files</p>
                      <p className="mt-1 text-xs text-text-muted">Upload screenshots, PDFs, or notes directly here, or attach existing project files.</p>
                    </div>
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => void uploadFiles(e.target.files)}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFiles}
                        className="inline-flex items-center gap-2 rounded-md border border-border bg-panel px-3 py-2 text-sm font-medium text-text-secondary transition hover:bg-panel-elevated disabled:opacity-50"
                      >
                        <Upload className="h-4 w-4" />
                        {uploadingFiles ? "Uploading..." : "Upload files"}
                      </button>
                    </div>
                  </div>

                  {uploadStatus ? <p className={cn("mt-3 text-xs", uploadStatus === "Files uploaded" ? "text-emerald-600" : "text-text-muted")}>{uploadStatus}</p> : null}

                  <div className="mt-3">
                    <p className="text-sm font-medium text-text-secondary">Attach existing project files</p>
                    {availableDocuments.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {availableDocuments.map((document) => {
                          const checked = selectedReferenceIds.includes(document.id);
                          return (
                            <label
                              key={document.id}
                              className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm",
                                checked ? "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40" : "border-border bg-panel",
                              )}
                            >
                              <input type="checkbox" checked={checked} onChange={() => toggleReferenceDocument(document.id)} className="mt-1" />
                              <div className="min-w-0">
                                <div className="font-medium text-text">{document.title}</div>
                                <div className="text-xs text-text-muted">{document.type}{document.mime_type ? ` • ${document.mime_type}` : ""}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-text-muted">No project files uploaded yet.</p>
                    )}
                  </div>
                </section>
              ) : null}

              <section className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setShowDetails((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  aria-expanded={showDetails}
                >
                  <div>
                    <p className="text-sm font-medium text-text">{modalCopy.detailsLabel}</p>
                    <p className="text-xs text-text-muted">Notes, stage context for support work, type defaults, review setting, and title override.</p>
                  </div>
                  <span className="text-xs font-medium text-text-muted">{showDetails ? "Hide" : "Show"}</span>
                </button>

                {showDetails ? (
                  <div className="space-y-4 border-t border-border px-4 py-4">
                    {!isDeliverableType ? (
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-text-secondary">Related stage (optional)</span>
                        <select
                          value={selectedMilestoneId}
                          onChange={(e) => setSelectedMilestoneId(e.target.value)}
                          className="w-full rounded-md border border-border bg-panel text-text px-3 py-2 text-sm"
                        >
                          <option value="">No specific stage</option>
                          {deliveryMilestones.map((milestone) => (
                            <option key={milestone.id} value={milestone.id}>
                              {milestone.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <section className="grid gap-4 sm:grid-cols-2">
                      {config.metadataFields.map((field) => (
                        <label key={field.key} className="block">
                          <span className="mb-1 block text-sm font-medium text-text-secondary">{field.label}</span>
                          <select
                            value={metadata[field.key] || ""}
                            onChange={(e) => setMetadata((current) => ({ ...current, [field.key]: e.target.value }))}
                            className="w-full rounded-md border border-border bg-panel px-3 py-2 text-sm text-text"
                          >
                            {field.options.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </section>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary">Supporting context</label>
                      <textarea value={contextNote} onChange={(e) => setContextNote(e.target.value)} rows={3} placeholder="References, constraints, or acceptance notes…" className="mt-1 w-full rounded-md border border-border bg-panel px-3 py-2 text-sm text-text" />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div>
                        <label className="block text-sm font-medium text-text-secondary">Title override</label>
                        <input value={titleOverride} onChange={(e) => setTitleOverride(e.target.value)} placeholder={generatedTitle} className="mt-1 w-full rounded-md border border-border bg-panel px-3 py-2 text-sm text-text" />
                        <p className="mt-1 text-xs text-text-muted">Default: {generatedTitle}</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-text-secondary">
                        <input type="checkbox" checked={reviewRequired} onChange={(e) => setReviewRequired(e.target.checked)} className="h-4 w-4 rounded border-border bg-panel" />
                        Review required
                      </label>
                    </div>

                    <div className="grid gap-2 text-xs text-text-muted sm:grid-cols-2">
                      {config.metadataFields.map((field) => (
                        <div key={field.key} className="rounded-lg border border-border bg-panel-elevated px-3 py-2">
                          <span className="font-medium text-text-secondary">{field.label}:</span> {humanizeTaskValue(metadata[field.key] || "")}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/80 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:flex-row sm:px-6 sm:py-5">
          <button onClick={onClose} className="flex-1 rounded-md border border-border bg-panel px-4 py-2 text-sm font-medium text-text-secondary hover:bg-panel-elevated">Cancel</button>
          <button
            onClick={submitPayload}
            disabled={!canSubmit || creating}
            className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {creating ? "Adding work..." : modalCopy.submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

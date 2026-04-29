"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";

export type StructuredTaskPayload = {
  sprint_id?: string;
  task_type?: string;
  task_goal: string;
  task_metadata?: Record<string, string>;
  context_note?: string;
  review_required?: boolean;
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

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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
  const [taskGoal, setTaskGoal] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [selectedRevisionTaskId, setSelectedRevisionTaskId] = useState("");
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

  useEffect(() => {
    if (!selectedRevisionTask) return;
    setSelectedMilestoneId(selectedRevisionTask.sprint_id ?? "");
  }, [selectedRevisionTask]);

  useEffect(() => {
    setAvailableDocuments((documents ?? []).slice().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
  }, [documents]);

  useEffect(() => {
    if (!open) {
      setTaskGoal("");
      setContextNote("");
      setShowDetails(false);
      setSelectedMilestoneId("");
      setSelectedRevisionTaskId("");
      setSelectedReferenceIds([]);
      setUploadStatus(null);
      setAvailableDocuments((documents ?? []).slice().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [documents, open]);

  if (!open) return null;

  const canSubmit = taskGoal.trim().length > 0;
  const followUpIntent: FollowUpIntent = selectedRevisionTask ? "revise_delivered_work" : selectedMilestone ? "add_deliverable" : "add_support_work";

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
    const autoContext: string[] = [];
    if (selectedMilestone?.name) autoContext.push(`Related stage: ${selectedMilestone.name}`);
    if (selectedRevisionTask) autoContext.push(`Revision target: ${selectedRevisionTask.title}`);
    if (selectedReferenceDocuments.length > 0) {
      autoContext.push(`Reference files:\n${selectedReferenceDocuments.map((document) => `- ${document.title}`).join("\n")}`);
    }

    onCreate({
      sprint_id: selectedRevisionTask?.sprint_id || selectedMilestoneId || undefined,
      task_goal: taskGoal.trim(),
      context_note: [...autoContext, contextNote.trim()].filter(Boolean).join("\n\n") || undefined,
      follow_up_intent: followUpIntent,
      revision_source_task_id: selectedRevisionTask?.id,
      revision_source_task_title: selectedRevisionTask?.title,
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
            <h3 className="text-lg font-semibold text-text">Add follow-up work</h3>
            <p className="mt-1 text-sm text-text-muted">Describe the request once. We’ll route it to the right team and keep any attachments with it.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-text-muted transition hover:bg-panel-elevated hover:text-text" aria-label="Close create task modal">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:py-5">
          <section className="space-y-3 rounded-xl border border-border bg-panel-elevated/80 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="rounded-full border border-border bg-panel px-2.5 py-1 font-medium">Message-first intake</span>
              <span className="rounded-full border border-border bg-panel px-2.5 py-1 font-medium">Automatic routing</span>
              {selectedRevisionTask ? <span className="rounded-full border border-border bg-panel px-2.5 py-1 font-medium">Linked to delivered work</span> : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary">What needs to change?</label>
              <textarea
                value={taskGoal}
                onChange={(e) => setTaskGoal(e.target.value)}
                rows={6}
                placeholder="Describe the follow-up request, change, or issue..."
                className="mt-1.5 w-full rounded-md border border-border bg-panel px-3 py-3 text-sm text-text"
              />
              <p className="mt-2 text-xs text-text-muted">You don’t need to choose the team or task type up front.</p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-panel-elevated/80 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-text">Attachments</p>
                <p className="mt-1 text-xs text-text-muted">Optional. Upload new files or attach existing project documents.</p>
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

          <section className="rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setShowDetails((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              aria-expanded={showDetails}
            >
              <div>
                <p className="text-sm font-medium text-text">Optional details</p>
                <p className="text-xs text-text-muted">Link this to a delivered task or stage, and add extra context if needed.</p>
              </div>
              <span className="text-xs font-medium text-text-muted">{showDetails ? "Hide" : "Show"}</span>
            </button>

            {showDetails ? (
              <div className="space-y-4 border-t border-border px-4 py-4">
                {revisionCandidateTasks.length > 0 ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-text-secondary">Delivered work to revise or reference (optional)</span>
                    <select
                      value={selectedRevisionTaskId}
                      onChange={(e) => setSelectedRevisionTaskId(e.target.value)}
                      className="w-full rounded-md border border-border bg-panel text-text px-3 py-2 text-sm"
                    >
                      <option value="">No linked delivered task</option>
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
                ) : null}

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

                <div>
                  <label className="block text-sm font-medium text-text-secondary">Extra context</label>
                  <textarea
                    value={contextNote}
                    onChange={(e) => setContextNote(e.target.value)}
                    rows={3}
                    placeholder="Anything else the worker should know?"
                    className="mt-1 w-full rounded-md border border-border bg-panel px-3 py-2 text-sm text-text"
                  />
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/80 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:flex-row sm:px-6 sm:py-5">
          <button onClick={onClose} className="flex-1 rounded-md border border-border bg-panel px-4 py-2 text-sm font-medium text-text-secondary hover:bg-panel-elevated">Cancel</button>
          <button
            onClick={submitPayload}
            disabled={!canSubmit || creating}
            className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {creating ? "Adding work..." : "Add follow-up"}
          </button>
        </div>
      </div>
    </div>
  );
}

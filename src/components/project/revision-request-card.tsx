"use client";

import { useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProjectDocument = {
  id: string;
  title: string;
  type: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  created_at: string;
};

export function RevisionRequestCard({
  projectId,
  sprintId,
  sprintName,
  documents,
  onSubmitted,
  hasActiveRevisionCycle = false,
  shippedApproved = false,
}: {
  projectId: string;
  sprintId: string;
  sprintName: string;
  documents: ProjectDocument[];
  onSubmitted?: () => void;
  hasActiveRevisionCycle?: boolean;
  shippedApproved?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const attachmentOptions = useMemo(() => documents.slice().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [documents]);
  const headingEyebrow = hasActiveRevisionCycle ? "Revision in progress" : shippedApproved ? "Post-completion revision" : "Revision request";
  const headingTitle = hasActiveRevisionCycle ? `Update revision request for ${sprintName}` : shippedApproved ? `Request a follow-up revision for ${sprintName}` : `Request changes for ${sprintName}`;
  const helperCopy = hasActiveRevisionCycle
    ? "A revision is already active for this milestone. Add any extra instructions or supporting files here."
    : shippedApproved
      ? "This milestone is already shipped and complete. Only open a new revision if you want another round of changes."
      : "Review the delivered work directly, then submit revision instructions only if changes are needed.";

  const toggle = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setStatus(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      const res = await fetch(`/api/projects/${projectId}/documents/upload`, {
        method: "POST",
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to upload files");
      const uploadedIds = Array.isArray(payload.documents) ? payload.documents.map((doc: any) => doc.id).filter(Boolean) : [];
      if (uploadedIds.length > 0) {
        setSelectedIds((current) => Array.from(new Set([...current, ...uploadedIds])));
      }
      setStatus("Files uploaded");
      onSubmitted?.();
    } catch (error: any) {
      setStatus(error?.message || "Failed to upload files");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submit = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/revision-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId, message, attachmentDocumentIds: selectedIds }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to submit revision request");
      setMessage("");
      setSelectedIds([]);
      setStatus("Revision request submitted");
      onSubmitted?.();
    } catch (error: any) {
      setStatus(error?.message || "Failed to submit revision request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{headingEyebrow}</div>
        <h3 className="mt-1 text-base font-semibold text-zinc-950">{headingTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{helperCopy} You can upload files here or attach existing project documents.</p>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-zinc-700">Revision instructions</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder={hasActiveRevisionCycle ? "Add more detail for the active revision cycle..." : "Describe what needs to change..."}
          className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
        />
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-700">Upload supporting files</div>
            <p className="mt-1 text-xs text-zinc-500">Add screenshots, PDFs, or notes directly from this revision request.</p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => void uploadFiles(e.target.files)}
            />
            <Button type="button" variant="outline" className="rounded-xl" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading..." : "Upload files"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm font-medium text-zinc-700">Attach existing project files</div>
        {attachmentOptions.length > 0 ? (
          <div className="mt-2 space-y-2">
            {attachmentOptions.map((doc) => {
              const checked = selectedIds.includes(doc.id);
              return (
                <label key={doc.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm", checked ? "border-red-300 bg-red-50" : "border-zinc-200 bg-zinc-50")}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(doc.id)} className="mt-1" />
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900">{doc.title}</div>
                    <div className="text-xs text-zinc-500">{doc.type}{doc.mime_type ? ` • ${doc.mime_type}` : ""}</div>
                  </div>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No project documents uploaded yet.</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {status ? <p className={cn("text-xs", status === "Revision request submitted" || status === "Files uploaded" ? "text-emerald-600" : "text-zinc-500")}>{status}</p> : <span />}
        <Button onClick={submit} disabled={saving || !message.trim()} variant={hasActiveRevisionCycle ? "warm" : "outline"} className="rounded-xl px-4">
          {saving ? "Submitting..." : hasActiveRevisionCycle ? "Update revision request" : shippedApproved ? "Request revision" : "Submit revision request"}
        </Button>
      </div>
    </div>
  );
}

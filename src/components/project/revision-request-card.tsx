"use client";

import { useMemo, useState } from "react";
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
}: {
  projectId: string;
  sprintId: string;
  sprintName: string;
  documents: ProjectDocument[];
  onSubmitted?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const attachmentOptions = useMemo(() => documents.slice().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [documents]);

  const toggle = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
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
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Revision request</div>
        <h3 className="mt-1 text-base font-semibold text-zinc-950">Request changes for {sprintName}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Review the delivered work directly, then submit revision instructions here. You can attach uploaded files to give visual or written guidance.</p>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-zinc-700">Revision instructions</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Describe what needs to change..."
          className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
        />
      </div>

      <div className="mt-4">
        <div className="text-sm font-medium text-zinc-700">Attach supporting files</div>
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
          <p className="mt-2 text-sm text-zinc-500">No uploaded project documents yet. Upload files in Documents first, then attach them here.</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {status ? <p className={cn("text-xs", status === "Revision request submitted" ? "text-emerald-600" : "text-zinc-500")}>{status}</p> : <span />}
        <Button onClick={submit} disabled={saving || !message.trim()} variant="warm" className="rounded-xl px-4">
          {saving ? "Submitting..." : "Submit revision request"}
        </Button>
      </div>
    </div>
  );
}

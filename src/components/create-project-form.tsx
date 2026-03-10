"use client";

import { useState, useEffect } from "react";

interface CreateProjectFormProps {
  onSubmit: (data: {
    name: string;
    type: string;
    description?: string;
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  prefillName?: string;
  prefillType?: string;
}

const PROJECT_TYPES = [
  { value: "saas", label: "SAAS" },
  { value: "web_app", label: "Web App" },
  { value: "native_app", label: "Native App" },
  { value: "marketing", label: "Marketing" },
  { value: "other", label: "Other" },
];

// AI auto-routes projects to teams based on type
function getAutoRouteTeam(type: string): string | null {
  switch (type) {
    case "saas":
    case "web_app":
    case "native_app":
      return "Engineering"; // These need engineering work
    case "marketing":
      return "Marketing";
    default:
      return null;
  }
}

export function CreateProjectForm({
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  prefillName,
  prefillType,
}: CreateProjectFormProps) {
  const [name, setName] = useState(prefillName || "");
  const [type, setType] = useState(prefillType || "saas");
  const [description, setDescription] = useState("");

  // Update state if prefill props change
  useEffect(() => {
    if (prefillName) setName(prefillName);
    if (prefillType) setType(prefillType);
  }, [prefillName, prefillType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const autoTeam = getAutoRouteTeam(type);
    await onSubmit({
      name,
      type,
      description: description || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-700">
          Project name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
          placeholder="e.g., Command Center V2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">
          Project type <span className="text-red-500">*</span>
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
        >
          {PROJECT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">AI will auto-route to the right team.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
          placeholder="Brief description..."
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isSubmitting ? "Creating..." : "Create project"}
        </button>
      </div>
    </form>
  );
}

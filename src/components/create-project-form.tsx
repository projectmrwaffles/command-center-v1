"use client";

import { useState } from "react";
import { useRealtimeStore } from "@/lib/realtime-store";

interface CreateProjectFormProps {
  onSubmit: (data: {
    name: string;
    type: string;
    teamId?: string;
    description?: string;
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
}

export function CreateProjectForm({
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: CreateProjectFormProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("engineering");
  const [teamId, setTeamId] = useState("");
  const [description, setDescription] = useState("");

  const teams = useRealtimeStore((s) => Array.from(s.teamsById.values()));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name,
      type,
      teamId: teamId || undefined,
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
          <option value="engineering">Engineering</option>
          <option value="marketing">Marketing</option>
          <option value="product">Product</option>
          <option value="design">Design</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Team</label>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
        >
          <option value="">Select team (optional)</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
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

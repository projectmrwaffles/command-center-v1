"use client";

import { useState } from "react";
import { useRealtimeStore } from "@/lib/realtime-store";
import { subscribeToAllTables } from "@/lib/realtime-subscribe";

export function useCreateProject() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProject = async (data: {
    name: string;
    type: string;
    teamId?: string;
    description?: string;
  }) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setIsOpen(false);
      return result.project;
    } catch (e: any) {
      setError(e?.message || "Failed to create project");
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isOpen,
    setIsOpen,
    isSubmitting,
    error,
    createProject,
  };
}

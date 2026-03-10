"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateProjectModal } from "@/components/create-project-modal";
import { DbBanner } from "@/components/db-banner";

function ProjectsContent() {
  const searchParams = useSearchParams();
  const showNew = searchParams.get("new") === "true";
  
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(showNew);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (e) {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <DbBanner />

      <CreateProjectModal 
        open={showCreateModal} 
        onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) {
            fetchData();
          }
        }}
      />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Projects</h1>
          <p className="text-sm text-zinc-500">Active projects with sprints and PRDs</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Project
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-600">{error}</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-zinc-500">No projects yet.</p>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="text-blue-600 hover:underline mt-2"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block">
              <Card className="hover:bg-zinc-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
                    <span className="capitalize">{p.type || "other"}</span>
                    <span className="capitalize">{p.status || "active"}</span>
                    <span>{p.progress_pct || 0}% complete</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <DbBanner />
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      </div>
    }>
      <ProjectsContent />
    </Suspense>
  );
}
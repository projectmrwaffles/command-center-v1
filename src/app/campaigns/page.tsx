"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateProjectModal } from "@/components/create-project-modal";

interface Campaign {
  id: string;
  name: string;
  status: string;
  type: string;
  description: string | null;
  created_at: string;
}

function CampaignsContent() {
  const searchParams = useSearchParams();
  const prefillName = searchParams.get("project") || "";
  
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(!!prefillName);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/projects?type=marketing");
      const json = await res.json();
      setCampaigns(json.projects || []);
    } catch (e) {
      console.error("Failed to load campaigns:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <CreateProjectModal 
        open={showCreateModal} 
        onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) {
            fetchCampaigns();
          }
        }}
        prefillName={prefillName}
        prefillType="marketing"
      />

      <header className="bg-white border-b border-zinc-200 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600">←</Link>
            <h1 className="text-lg font-semibold text-zinc-900">Marketing Campaigns</h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Campaign
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12 text-zinc-500">Loading...</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500">No marketing campaigns yet.</p>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="text-blue-600 hover:underline mt-2 inline-block"
            >
              Create your first campaign
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <Link key={campaign.id} href={`/projects/${campaign.id}`}>
                <Card className="border-zinc-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{campaign.name}</CardTitle>
                      <StatusBadge status={campaign.status} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-600 line-clamp-3">
                      {campaign.description || "No description"}
                    </p>
                    <div className="mt-3 text-xs text-zinc-400">
                      Created {new Date(campaign.created_at).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    }>
      <CampaignsContent />
    </Suspense>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    completed: "bg-blue-100 text-blue-700",
    paused: "bg-amber-100 text-amber-700",
    archived: "bg-zinc-100 text-zinc-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || styles.active}`}>
      {status}
    </span>
  );
}
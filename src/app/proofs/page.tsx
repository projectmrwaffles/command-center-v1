import { DbBanner } from "@/components/db-banner";
import { ErrorState } from "@/components/error-state";
import { ProofReviewClient } from "./proof-review-client";
import { createServerClient } from "@/lib/supabase-server";
import { mapApprovalToProofRecord, type ApprovalProofRow, type ProofRecord } from "@/lib/proof-review";

export const dynamic = "force-dynamic";

async function loadProofs(): Promise<{ proofs: ProofRecord[]; error?: { message: string; details?: string } }> {
  const db = createServerClient();
  if (!db) {
    return { proofs: [], error: { message: "DB not initialized", details: "Supabase env missing or migrations not applied." } };
  }

  try {
    const res = await db
      .from("approvals")
      .select("id, status, summary, note, created_at, decided_at, requester_name, context, agents(name, title), jobs(title, status), projects(name, links, github_repo_binding), sprints(name)")
      .order("created_at", { ascending: false });

    const proofs = ((res.data ?? []) as ApprovalProofRow[]).map(mapApprovalToProofRecord);
    return { proofs };
  } catch (err) {
    return {
      proofs: [],
      error: {
        message: "Failed to load proofs",
        details: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export default async function ProofsPage() {
  const { proofs, error } = await loadProofs();

  if (error) {
    return (
      <div className="space-y-6">
        <DbBanner />
        <ErrorState title="Error loading proof inbox" message={error.message} details={error.details} />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <DbBanner />
      <ProofReviewClient initialProofs={proofs} />
    </div>
  );
}

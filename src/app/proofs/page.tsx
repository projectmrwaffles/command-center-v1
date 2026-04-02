import { DbBanner } from "@/components/db-banner";
import { ErrorState } from "@/components/error-state";
import { ProofReviewClient } from "./proof-review-client";
import { createServerClient } from "@/lib/supabase-server";
import { mapApprovalToProofRecord, mapProofBundleToProofRecord, type ApprovalProofRow, type ProofBundleProofRow, type ProofRecord } from "@/lib/proof-review";

export const dynamic = "force-dynamic";

async function loadProofs(): Promise<{ proofs: ProofRecord[]; error?: { message: string; details?: string } }> {
  const db = createServerClient();
  if (!db) {
    return { proofs: [], error: { message: "DB not initialized", details: "Supabase env missing or migrations not applied." } };
  }

  try {
    const [bundleRes, approvalRes] = await Promise.all([
      db
        .from("proof_bundles")
        .select("id, title, summary, completeness_status, created_at, updated_at, milestone_submissions(id, summary, what_changed, decision, decision_notes, submitted_at, decided_at, sprints(name, project_id, projects(name, links, github_repo_binding))), proof_items(id, kind, label, url)")
        .order("created_at", { ascending: false }),
      db
        .from("approvals")
        .select("id, status, summary, note, created_at, decided_at, requester_name, context, agents(name, title), jobs(title, status), projects(name, links, github_repo_binding), sprints(name)")
        .order("created_at", { ascending: false }),
    ]);

    const bundleProofs = ((bundleRes.data ?? []) as unknown as ProofBundleProofRow[]).map(mapProofBundleToProofRecord);
    const approvalProofs = ((approvalRes.data ?? []) as ApprovalProofRow[])
      .map(mapApprovalToProofRecord)
      .filter((approvalProof) => !bundleProofs.some((bundleProof) => bundleProof.title === approvalProof.title && bundleProof.projectName === approvalProof.projectName && bundleProof.sprintName === approvalProof.sprintName));

    return { proofs: [...bundleProofs, ...approvalProofs].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)) };
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

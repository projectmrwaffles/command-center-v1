import { ProofReviewClient } from "./proof-review-client";
import { sampleProofRecords } from "@/lib/proof-review";

export default function ProofsPage() {
  return <ProofReviewClient initialProofs={sampleProofRecords} />;
}

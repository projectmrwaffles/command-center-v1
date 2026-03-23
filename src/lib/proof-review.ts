export type ProofStatus = "pending" | "approved" | "rejected";
export type ProofKind = "owner" | "artifact" | "handoff";

export type ProofRecord = {
  id: string;
  title: string;
  owner: string;
  repository: string;
  kind: ProofKind;
  status: ProofStatus;
  updatedAt: string;
  summary: string;
  detail: string;
};

export const sampleProofRecords: ProofRecord[] = [
  {
    id: "proof-1",
    title: "Owner serialization readiness",
    owner: "platform-ops",
    repository: "projectmrwaffles/command-center-v1",
    kind: "owner",
    status: "pending",
    updatedAt: "2026-03-23T19:21:00Z",
    summary: "Awaiting final owner serialization confirmation before release handoff.",
    detail: "The proof payload includes owner routing metadata, but the final serialized view still needs operator review before the project leaves triage.",
  },
  {
    id: "proof-2",
    title: "Artifact bundle confirmation",
    owner: "release-eng",
    repository: "projectmrwaffles/command-center-v1",
    kind: "artifact",
    status: "approved",
    updatedAt: "2026-03-23T18:54:00Z",
    summary: "Artifact bundle was attached and verified against the final review request.",
    detail: "Checks passed for artifact links, release note pairing, and audit metadata. No operator follow-up is currently required.",
  },
  {
    id: "proof-3",
    title: "Handoff ack trace",
    owner: "qa-systems",
    repository: "projectmrwaffles/command-center-v1",
    kind: "handoff",
    status: "rejected",
    updatedAt: "2026-03-23T18:17:00Z",
    summary: "The expected handoff acknowledgement was not present in the serialized operator thread.",
    detail: "Reviewers saw the task move forward, but the final ownership handoff comment did not land in the target channel, so the proof must be rerun.",
  },
  {
    id: "proof-4",
    title: "Owner follow-up payload",
    owner: "build-pm",
    repository: "projectmrwaffles/command-center-v1",
    kind: "owner",
    status: "pending",
    updatedAt: "2026-03-23T17:43:00Z",
    summary: "Follow-up payload is queued for owner serialization review.",
    detail: "The owner-facing summary is complete, but the compact serialization needs one more pass to make sure escalation notes are preserved.",
  },
];

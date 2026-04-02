import type { ProjectLinks } from "@/lib/project-links";

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
  projectName: string;
  sprintName: string | null;
  jobTitle: string | null;
  requesterName: string | null;
  sourceTable: "approvals" | "proof_bundles";
  sourceId: string;
  sourceUrl: string | null;
  createdAt: string;
  decidedAt: string | null;
  reviewerName: string | null;
};

export type ApprovalProofRow = {
  id: string;
  status: string;
  summary: string | null;
  note: string | null;
  created_at: string;
  decided_at: string | null;
  requester_name: string | null;
  context?: { kind?: string | null; note?: string | null; links?: ProjectLinks | null } | null;
  agents?: { name: string | null; title: string | null } | { name: string | null; title: string | null }[] | null;
  jobs?: { title: string | null; status: string | null } | { title: string | null; status: string | null }[] | null;
  projects?: {
    name: string | null;
    links?: ProjectLinks | null;
    github_repo_binding?: { url?: string | null; fullName?: string | null } | null;
  } | {
    name: string | null;
    links?: ProjectLinks | null;
    github_repo_binding?: { url?: string | null; fullName?: string | null } | null;
  }[] | null;
  sprints?: { name: string | null } | { name: string | null }[] | null;
};

export type ProofBundleProofRow = {
  id: string;
  title: string | null;
  summary: string | null;
  completeness_status: string | null;
  created_at: string;
  updated_at: string;
  milestone_submissions?: {
    id: string;
    summary: string | null;
    what_changed: string | null;
    decision: string | null;
    decision_notes: string | null;
    submitted_at: string | null;
    decided_at: string | null;
    sprints?: {
      name: string | null;
      project_id: string | null;
      projects?: {
        name: string | null;
        links?: ProjectLinks | null;
        github_repo_binding?: { url?: string | null; fullName?: string | null } | null;
      } | null;
    } | null;
  } | null;
  proof_items?: Array<{
    id: string;
    kind: string | null;
    label: string | null;
    url: string | null;
  }> | null;
};

function getJoinedRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapStatus(status: string): ProofStatus {
  if (status === "approved") return "approved";
  if (status === "changes_requested" || status === "rejected") return "rejected";
  return "pending";
}

function mapKind(kind?: string | null): ProofKind {
  if (kind === "artifact_gate_review" || kind === "artifact") return "artifact";
  if (kind === "project_review_handoff" || kind === "handoff") return "handoff";
  return "owner";
}

function getRepositoryLabel(input: { sourceUrl: string | null; binding?: { fullName?: string | null } | null }) {
  if (input.binding?.fullName) return input.binding.fullName;
  if (!input.sourceUrl) return "No linked repository";

  try {
    const url = new URL(input.sourceUrl);
    if (url.hostname === "github.com" || url.hostname === "www.github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) return `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
    }
    return url.hostname;
  } catch {
    return input.sourceUrl;
  }
}

export function mapApprovalToProofRecord(row: ApprovalProofRow): ProofRecord {
  const agent = getJoinedRow(row.agents);
  const job = getJoinedRow(row.jobs);
  const project = getJoinedRow(row.projects);
  const sprint = getJoinedRow(row.sprints);
  const sourceUrl = project?.github_repo_binding?.url || project?.links?.github || row.context?.links?.github || null;
  const status = mapStatus(row.status);
  const kind = mapKind(row.context?.kind);

  return {
    id: row.id,
    title: row.summary || job?.title || "Approval evidence",
    owner: agent?.name || row.requester_name || "Unknown owner",
    repository: getRepositoryLabel({ sourceUrl, binding: project?.github_repo_binding || null }),
    kind,
    status,
    updatedAt: row.decided_at || row.created_at,
    summary: row.note || row.context?.note || "Review evidence captured from the persisted approval request.",
    detail:
      row.note ||
      row.context?.note ||
      `Approval ${row.id} is stored in Supabase and linked to ${project?.name || "an unknown project"}${sprint?.name ? ` / ${sprint.name}` : ""}.`,
    projectName: project?.name || "Unknown project",
    sprintName: sprint?.name || null,
    jobTitle: job?.title || null,
    requesterName: row.requester_name || null,
    sourceTable: "approvals",
    sourceId: row.id,
    sourceUrl,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    reviewerName: status === "pending" ? null : "Operator decision recorded",
  };
}

export function mapProofBundleToProofRecord(row: ProofBundleProofRow): ProofRecord {
  const submission = getJoinedRow(row.milestone_submissions as any);
  const sprint = getJoinedRow(submission?.sprints as any);
  const project = getJoinedRow(sprint?.projects as any);
  const proofItem = row.proof_items?.[0] || null;
  const sourceUrl = proofItem?.url || project?.github_repo_binding?.url || project?.links?.github || null;
  const status = mapStatus(submission?.decision || "pending");
  const kind = mapKind(proofItem?.kind);

  return {
    id: row.id,
    title: row.title || submission?.summary || sprint?.name || "Proof bundle",
    owner: "Workflow submission",
    repository: getRepositoryLabel({ sourceUrl, binding: project?.github_repo_binding || null }),
    kind,
    status,
    updatedAt: submission?.decided_at || row.updated_at || row.created_at,
    summary: row.summary || submission?.what_changed || "Proof bundle attached to a milestone review submission.",
    detail:
      submission?.decision_notes ||
      submission?.what_changed ||
      `Proof bundle ${row.id} is attached to ${project?.name || "an unknown project"}${sprint?.name ? ` / ${sprint.name}` : ""}.`,
    projectName: project?.name || "Unknown project",
    sprintName: sprint?.name || null,
    jobTitle: null,
    requesterName: null,
    sourceTable: "proof_bundles",
    sourceId: row.id,
    sourceUrl,
    createdAt: row.created_at,
    decidedAt: submission?.decided_at || null,
    reviewerName: status === "pending" ? null : "Operator decision recorded",
  };
}

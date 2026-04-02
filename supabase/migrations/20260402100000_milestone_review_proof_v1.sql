-- Milestone review + proof V1
-- Owner: Bolt
-- QC Approver: Shield
--
-- Repo-specific decision:
-- Reuse existing `sprints` as milestone/checkpoint records.
-- Add dedicated submission/proof/feedback tables around them.

create table if not exists milestone_submissions (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references sprints(id) on delete cascade,
  submitted_by_agent_id uuid null references agents(id) on delete set null,
  decided_by_agent_id uuid null references agents(id) on delete set null,
  approval_id uuid null references approvals(id) on delete set null,
  revision_number integer not null,
  summary text not null,
  what_changed text not null,
  risks text null,
  status text not null default 'submitted',
  decision text null,
  decision_notes text null,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz null,
  superseded_by_submission_id uuid null references milestone_submissions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestone_submissions_status_check check (
    status in ('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'superseded')
  ),
  constraint milestone_submissions_decision_check check (
    decision in ('approve', 'request_changes') or decision is null
  ),
  constraint milestone_submissions_revision_unique unique (sprint_id, revision_number)
);

create table if not exists proof_bundles (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references milestone_submissions(id) on delete cascade,
  created_by_agent_id uuid null references agents(id) on delete set null,
  title text not null,
  summary text null,
  completeness_status text not null default 'incomplete',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proof_bundles_completeness_check check (
    completeness_status in ('incomplete', 'ready', 'needs_update', 'archived')
  )
);

create table if not exists proof_items (
  id uuid primary key default gen_random_uuid(),
  proof_bundle_id uuid not null references proof_bundles(id) on delete cascade,
  created_by_agent_id uuid null references agents(id) on delete set null,
  kind text not null,
  label text not null,
  url text null,
  storage_path text null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint proof_items_kind_check check (
    kind in ('figma', 'screenshot', 'staging_url', 'github_pr', 'commit', 'loom', 'doc', 'artifact', 'checklist', 'note')
  )
);

create table if not exists submission_feedback_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references milestone_submissions(id) on delete cascade,
  author_agent_id uuid null references agents(id) on delete set null,
  feedback_type text not null,
  body text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint submission_feedback_items_type_check check (
    feedback_type in ('blocker', 'required', 'optional', 'question')
  ),
  constraint submission_feedback_items_status_check check (
    status in ('open', 'resolved', 'carried_forward')
  )
);

create index if not exists idx_milestone_submissions_sprint_revision
  on milestone_submissions (sprint_id, revision_number desc);

create index if not exists idx_milestone_submissions_status_submitted_at
  on milestone_submissions (status, submitted_at desc);

create index if not exists idx_proof_bundles_completeness_created
  on proof_bundles (completeness_status, created_at desc);

create index if not exists idx_proof_items_bundle_sort
  on proof_items (proof_bundle_id, sort_order);

create index if not exists idx_submission_feedback_items_submission_status
  on submission_feedback_items (submission_id, status);

-- Optional follow-up for Bolt after first successful rollout:
-- - add updated_at triggers
-- - add a partial unique index for one active submission per sprint
-- - add helper views for latest submission / latest proof bundle per sprint

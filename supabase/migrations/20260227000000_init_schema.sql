-- Command Center V1 — Sprint 0 Schema + RLS
-- 7 MVP tables with row-level security

-- Enable UUID generation
create extension if not exists "pgcrypto";

------------------------------------------------------------
-- 1. agents
------------------------------------------------------------
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  type text not null check (type in ('primary','sub')),
  status text not null default 'idle' check (status in ('active','idle','offline','error')),
  last_seen timestamptz,
  current_job_id uuid,
  capabilities text[] default '{}',
  api_key_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agents enable row level security;

-- Admin (authenticated human): read/write all
create policy "admin_agents_all" on public.agents
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Service role (agents via API key): read own, update own status/heartbeat
create policy "agent_read_own" on public.agents
  for select using (auth.role() = 'service_role');

create policy "agent_update_own" on public.agents
  for update using (
    auth.role() = 'service_role'
    and id = current_setting('app.current_agent_id', true)::uuid
  )
  with check (
    auth.role() = 'service_role'
    and id = current_setting('app.current_agent_id', true)::uuid
  );

------------------------------------------------------------
-- 2. projects
------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_type text,
  status text not null default 'active' check (status in ('active','paused','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "admin_projects_all" on public.projects
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "agent_projects_read" on public.projects
  for select using (auth.role() = 'service_role');

------------------------------------------------------------
-- 3. jobs
------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id),
  title text not null,
  status text not null default 'queued' check (status in ('queued','in_progress','blocked','waiting_approval','completed','failed')),
  owner_agent_id uuid not null references public.agents(id),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.jobs enable row level security;

create policy "admin_jobs_all" on public.jobs
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "agent_jobs_read_own" on public.jobs
  for select using (
    auth.role() = 'service_role'
    and owner_agent_id = current_setting('app.current_agent_id', true)::uuid
  );

create policy "agent_jobs_update_own" on public.jobs
  for update using (
    auth.role() = 'service_role'
    and owner_agent_id = current_setting('app.current_agent_id', true)::uuid
  )
  with check (
    auth.role() = 'service_role'
    and owner_agent_id = current_setting('app.current_agent_id', true)::uuid
  );

------------------------------------------------------------
-- 4. agent_events
------------------------------------------------------------
create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  agent_id uuid not null references public.agents(id),
  project_id uuid references public.projects(id),
  job_id uuid references public.jobs(id),
  event_type text not null check (event_type in (
    'APPROVAL_REQUESTED','APPROVED','CHANGES_REQUESTED',
    'JOB_STATUS_CHANGED','HEARTBEAT','ARTIFACT_CREATED','AI_USAGE_RECORDED'
  )),
  payload jsonb default '{}',
  created_at timestamptz not null default now()
);

alter table public.agent_events enable row level security;

create policy "admin_events_read" on public.agent_events
  for select using (auth.role() = 'authenticated');

create policy "agent_events_read_own" on public.agent_events
  for select using (
    auth.role() = 'service_role'
    and agent_id = current_setting('app.current_agent_id', true)::uuid
  );

create policy "agent_events_insert_own" on public.agent_events
  for insert with check (
    auth.role() = 'service_role'
    and agent_id = current_setting('app.current_agent_id', true)::uuid
  );

------------------------------------------------------------
-- 5. ai_usage
------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id),
  project_id uuid references public.projects(id),
  job_id uuid references public.jobs(id),
  provider text not null,
  model text not null,
  api_type text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  total_tokens integer not null default 0,
  cost_usd numeric(10,6),
  metadata jsonb default '{}',
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.ai_usage enable row level security;

create policy "admin_usage_read" on public.ai_usage
  for select using (auth.role() = 'authenticated');

create policy "agent_usage_read_own" on public.ai_usage
  for select using (
    auth.role() = 'service_role'
    and agent_id = current_setting('app.current_agent_id', true)::uuid
  );

create policy "agent_usage_insert_own" on public.ai_usage
  for insert with check (
    auth.role() = 'service_role'
    and agent_id = current_setting('app.current_agent_id', true)::uuid
  );

------------------------------------------------------------
-- 6. approvals
------------------------------------------------------------
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  agent_id uuid not null references public.agents(id),
  status text not null default 'pending' check (status in ('pending','approved','changes_requested')),
  summary text,
  note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.approvals enable row level security;

create policy "admin_approvals_all" on public.approvals
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "agent_approvals_insert" on public.approvals
  for insert with check (
    auth.role() = 'service_role'
    and agent_id = current_setting('app.current_agent_id', true)::uuid
  );

------------------------------------------------------------
-- 7. artifacts
------------------------------------------------------------
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('figma','link','file','screenshot')),
  url text,
  storage_path text,
  project_id uuid references public.projects(id),
  job_id uuid references public.jobs(id),
  agent_id uuid references public.agents(id),
  approval_id uuid references public.approvals(id),
  created_at timestamptz not null default now()
);

alter table public.artifacts enable row level security;

create policy "admin_artifacts_all" on public.artifacts
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "agent_artifacts_read_own" on public.artifacts
  for select using (
    auth.role() = 'service_role'
    and agent_id = current_setting('app.current_agent_id', true)::uuid
  );

create policy "agent_artifacts_insert_own" on public.artifacts
  for insert with check (
    auth.role() = 'service_role'
    and agent_id = current_setting('app.current_agent_id', true)::uuid
  );

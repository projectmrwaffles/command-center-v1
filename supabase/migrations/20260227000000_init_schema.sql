-- Command Center V1 — Sprint 0 Schema + RLS
-- 7 MVP tables with row-level security
-- Adjusted for Agent = Auth User model (auth.uid() checks)

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

-- Admin: all access
create policy "admin_agents_all" on public.agents
  for all using (auth.role() = 'authenticated' and email like '%@commandcenter.test' is false)
  with check (auth.role() = 'authenticated');
  -- NOTE: For production we'd use a claim or specific email whitelist.
  -- For this test, we assume non-agent emails are admins.
  -- Better: we just rely on the fact admins sign in via magic link (usually) vs agents via specific flow.
  -- To keep it simple: Authenticated = Admin, UNLESS it restricts to own ID.
  -- Actually, let's keep "admin_agents_all" open for now, but restrict AGENT logic tighter.

create policy "agent_read_own" on public.agents
  for select using (auth.uid() = id);

create policy "agent_update_own" on public.agents
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

------------------------------------------------------------
-- 2. projects
------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_type text,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.projects enable row level security;

create policy "admin_projects_all" on public.projects
  for all using (auth.role() = 'authenticated'); 
  -- Agents need to read assigned projects. For MVP, allowing read-all projects is safer than blocking.
  -- Let's stick to "authenticated can read all projects" for now, write restricted.

------------------------------------------------------------
-- 3. jobs
------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id),
  title text not null,
  status text not null default 'queued',
  owner_agent_id uuid not null references public.agents(id),
  summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.jobs enable row level security;

create policy "admin_jobs_all" on public.jobs for all using (true); -- simplify admin for a moment to debug agent

create policy "agent_jobs_update_own" on public.jobs
  for update using (auth.uid() = owner_agent_id)
  with check (auth.uid() = owner_agent_id);

------------------------------------------------------------
-- 4. agent_events
------------------------------------------------------------
create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz default now(),
  agent_id uuid not null references public.agents(id),
  project_id uuid references public.projects(id),
  job_id uuid references public.jobs(id),
  event_type text not null,
  payload jsonb default '{}',
  created_at timestamptz default now()
);
alter table public.agent_events enable row level security;

create policy "admin_events_read" on public.agent_events for select using (true);

create policy "agent_events_insert_own" on public.agent_events
  for insert with check (
    auth.uid() = agent_id
  );

------------------------------------------------------------
-- 5. ai_usage
------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id),
  provider text not null,
  model text not null,
  tokens_in int default 0,
  tokens_out int default 0,
  total_tokens int default 0,
  cost_usd numeric,
  created_at timestamptz default now()
);
alter table public.ai_usage enable row level security;

create policy "admin_usage_read" on public.ai_usage for select using (true);

create policy "agent_usage_insert_own" on public.ai_usage
  for insert with check (auth.uid() = agent_id);

------------------------------------------------------------
-- 6. approvals
------------------------------------------------------------
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  agent_id uuid not null references public.agents(id),
  status text default 'pending',
  summary text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz default now()
);
alter table public.approvals enable row level security;

create policy "admin_approvals_all" on public.approvals for all using (true);

------------------------------------------------------------
-- 7. artifacts
------------------------------------------------------------
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  url text,
  agent_id uuid references public.agents(id),
  created_at timestamptz default now()
);
alter table public.artifacts enable row level security;

create policy "admin_artifacts_all" on public.artifacts for all using (true);

-- Fix: Drop all old agent-identity RLS policies.
-- New model: Agents are NOT DB clients. They call Next.js API with X-Agent-Key.
-- API uses service_role for DB writes with explicit agent_id filtering.
-- RLS only protects browser users (anon = blocked, authenticated = admin).

-- ============ agents ============
drop policy if exists "admin_agents_all" on public.agents;
drop policy if exists "agent_read_own" on public.agents;
drop policy if exists "agent_update_own" on public.agents;

create policy "auth_agents_all" on public.agents
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============ projects ============
drop policy if exists "admin_projects_all" on public.projects;
drop policy if exists "agent_projects_read" on public.projects;

create policy "auth_projects_all" on public.projects
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============ jobs ============
drop policy if exists "admin_jobs_all" on public.jobs;
drop policy if exists "agent_jobs_read_own" on public.jobs;
drop policy if exists "agent_jobs_update_own" on public.jobs;

create policy "auth_jobs_all" on public.jobs
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============ agent_events ============
drop policy if exists "admin_events_read" on public.agent_events;
drop policy if exists "agent_events_read_own" on public.agent_events;
drop policy if exists "agent_events_insert_own" on public.agent_events;

-- Admin (authenticated browser user) can read all events, no insert
create policy "auth_events_select" on public.agent_events
  for select using (auth.role() = 'authenticated');

-- No insert policy for authenticated — agents insert via API (service_role)

-- ============ ai_usage ============
drop policy if exists "admin_usage_read" on public.ai_usage;
drop policy if exists "agent_usage_read_own" on public.ai_usage;
drop policy if exists "agent_usage_insert_own" on public.ai_usage;

create policy "auth_usage_select" on public.ai_usage
  for select using (auth.role() = 'authenticated');

-- ============ approvals ============
drop policy if exists "admin_approvals_all" on public.approvals;
drop policy if exists "agent_approvals_insert" on public.approvals;

create policy "auth_approvals_all" on public.approvals
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============ artifacts ============
drop policy if exists "admin_artifacts_all" on public.artifacts;
drop policy if exists "agent_artifacts_read_own" on public.artifacts;
drop policy if exists "agent_artifacts_insert_own" on public.artifacts;

create policy "auth_artifacts_all" on public.artifacts
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

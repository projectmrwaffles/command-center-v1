-- V1 closeout hardening: remove remaining legacy anon/public read policies
-- from earlier realtime experiments. Internal dashboards should read through
-- trusted server routes, not directly from anon PostgREST access.

BEGIN;

-- Projects / planning surfaces
DROP POLICY IF EXISTS "anon_projects_select" ON public.projects;
DROP POLICY IF EXISTS "anon_sprints_select" ON public.sprints;
DROP POLICY IF EXISTS "anon_sprint_items_select" ON public.sprint_items;
DROP POLICY IF EXISTS "Allow anon sprint_items_select" ON public.sprint_items;
DROP POLICY IF EXISTS "Allow anon select sprint_items" ON public.sprint_items;

-- Agent / approvals telemetry
DROP POLICY IF EXISTS "anon_agents_select" ON public.agents;
DROP POLICY IF EXISTS "anon_jobs_select" ON public.jobs;
DROP POLICY IF EXISTS "anon_agent_events_select" ON public.agent_events;
DROP POLICY IF EXISTS "anon_approvals_select" ON public.approvals;
DROP POLICY IF EXISTS "Allow anon agent_events_insert" ON public.agent_events;

-- Team and document leakage
DROP POLICY IF EXISTS "Allow anon team_members" ON public.team_members;
DROP POLICY IF EXISTS "Allow anon read access to team_members" ON public.team_members;
DROP POLICY IF EXISTS "anon_documents_select" ON public.project_documents;
DROP POLICY IF EXISTS "anon_prds_select" ON public.prds;

COMMIT;

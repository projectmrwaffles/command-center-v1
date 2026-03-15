-- V1 hardening: remove broad anon write/read policies that expose internal ops data.
-- Service-role server routes still work; public dashboards should read only intentionally exposed tables.

DROP POLICY IF EXISTS "Allow anon sprint_items_insert" ON public.sprint_items;
DROP POLICY IF EXISTS "Allow anon sprint_items_select" ON public.sprint_items;
DROP POLICY IF EXISTS "Allow anon sprint_items_insert" ON public.sprint_items;
DROP POLICY IF EXISTS "Allow anon select sprint_items" ON public.sprint_items;
DROP POLICY IF EXISTS "Allow anon sprint_items_insert" ON public.sprint_items;

DROP POLICY IF EXISTS "Allow anon agent_events_insert" ON public.agent_events;
DROP POLICY IF EXISTS "Allow anon team_members" ON public.team_members;
DROP POLICY IF EXISTS "Allow anon read access to team_members" ON public.team_members;
DROP POLICY IF EXISTS "Allow anon teams" ON public.teams;
DROP POLICY IF EXISTS "anon_prds_select" ON public.prds;
DROP POLICY IF EXISTS "anon_documents_select" ON public.project_documents;

-- Keep usage_rollup_minute readable for lightweight public dashboard rollups if desired,
-- but internal project/task/docs/team tables should require trusted server access.

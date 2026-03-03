-- Command Center V1 Schema Extensions
-- Extend existing tables (jobs, approvals, ai_usage) + add teams, prds, sprints

-- Extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

------------------------------------------------------------
-- 1. teams
------------------------------------------------------------
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  settings jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_teams_all" ON public.teams
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

------------------------------------------------------------
-- 2. team_members (humans + agents can belong to teams)
------------------------------------------------------------
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_or_agent CHECK (user_id IS NOT NULL OR agent_id IS NOT NULL),
  CONSTRAINT one_member CHECK (NOT (user_id IS NOT NULL AND agent_id IS NOT NULL))
);

CREATE UNIQUE INDEX idx_team_members_unique_user ON public.team_members(team_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_team_members_unique_agent ON public.team_members(team_id, agent_id) WHERE agent_id IS NOT NULL;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_team_members_all" ON public.team_members
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

------------------------------------------------------------
-- 3. projects: add type + team_id
------------------------------------------------------------
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS "type" text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.projects ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.projects ALTER COLUMN name TYPE text USING name::text;

-- Ensure projects.name is NOT NULL (seed could have violated)
ALTER TABLE public.projects ALTER COLUMN name SET NOT NULL;

-- drop old RLS if exists and recreate
DROP POLICY IF EXISTS "auth_projects_all" ON public.projects;
CREATE POLICY "auth_projects_all" ON public.projects
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

------------------------------------------------------------
-- 4. sprints per project
------------------------------------------------------------
CREATE TABLE public.sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_sprints_all" ON public.sprints
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

------------------------------------------------------------
-- 5. sprint_items (tasks/work items within a sprint)
------------------------------------------------------------
CREATE TABLE public.sprint_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id uuid NOT NULL REFERENCES public.sprints(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','blocked','cancelled')),
  assignee_agent_id uuid REFERENCES public.agents(id),
  assignee_user_id uuid REFERENCES auth.users(id),
  story_points int,
  position int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sprint_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_sprint_items_all" ON public.sprint_items
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

------------------------------------------------------------
-- 6. prds (Product Requirements Docs)
------------------------------------------------------------
CREATE TABLE public.prds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  body_markdown text,
  pdf_url text,
  version int NOT NULL DEFAULT 1,
  prev_version_id uuid REFERENCES public.prds(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','active','superseded')),
  submitted_at timestamptz,
  created_by_agent_id uuid REFERENCES public.agents(id),
  created_by_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_prds_all" ON public.prds
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

------------------------------------------------------------
-- 7. approvals: add fields for richer UX (project_id, requester_name, severity)
------------------------------------------------------------
ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requester_name text,
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical'));

------------------------------------------------------------
-- 8. jobs: add prd_id and ensure project_id/agent_id exist
------------------------------------------------------------
-- seed.sql had project_id already; add prd_id
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS prd_id uuid REFERENCES public.prds(id) ON DELETE SET NULL;

-- create updated policy
DROP POLICY IF EXISTS "auth_jobs_all" ON public.jobs;
CREATE POLICY "auth_jobs_all" ON public.jobs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

------------------------------------------------------------
-- 9. agent_events: add project_id, job_id (richer joins)
------------------------------------------------------------
-- Already present in init_schema per earlier inspection (seed had project_id/job_id in events)
-- If not, add them:
ALTER TABLE public.agent_events
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;

------------------------------------------------------------
-- 10. ai_usage: add project_id, job_id, agent_id, model, provider, tokens, cost_usd if not exist
------------------------------------------------------------
ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;
-- agent_id, provider, model, tokens_in, tokens_out, total_tokens, cost_usd already in init_schema

-- create comprehensive policy
DROP POLICY IF EXISTS "auth_usage_select" ON public.ai_usage;
CREATE POLICY "auth_usage_all" ON public.ai_usage
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

------------------------------------------------------------
-- 11. artifacts: richer linking
------------------------------------------------------------
ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prd_id uuid REFERENCES public.prds(id) ON DELETE SET NULL;

-- policy refresh
drop policy if exists "auth_artifacts_all" on public.artifacts;
create policy "auth_artifacts_all" on public.artifacts
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

------------------------------------------------------------
-- 12. triggers to auto-update updated_at
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sprints_updated_at BEFORE UPDATE ON public.sprints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sprint_items_updated_at BEFORE UPDATE ON public.sprint_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER prds_updated_at BEFORE UPDATE ON public.prds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER approvals_updated_at BEFORE UPDATE ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

------------------------------------------------------------
-- 13. Compatibility views (requested names)
------------------------------------------------------------
-- Option A keeps existing tables; expose new names as views for UI compatibility.
CREATE OR REPLACE VIEW public.ai_usage_events AS
  SELECT * FROM public.ai_usage;

CREATE OR REPLACE VIEW public.approval_requests AS
  SELECT * FROM public.approvals;

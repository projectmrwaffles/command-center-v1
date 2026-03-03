-- Realtime + incremental rollups (no heavy aggregates)
-- Adds: ai_usage_events table, usage_rollup_minute table, progress_pct fields + triggers

BEGIN;

------------------------------------------------------------
-- 1) usage events (canonical per LLM call)
------------------------------------------------------------
-- Previously we created ai_usage_events as a VIEW for compatibility.
-- Replace it with a TABLE.
DROP VIEW IF EXISTS public.ai_usage_events;

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL,
  tokens_in int NOT NULL DEFAULT 0,
  tokens_out int NOT NULL DEFAULT 0,
  total_tokens int NOT NULL DEFAULT 0,
  cost_usd numeric,
  meta jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Browser reads via anon key (read-only). Writes happen server-side with service role.
DROP POLICY IF EXISTS "anon_ai_usage_events_select" ON public.ai_usage_events;
CREATE POLICY "anon_ai_usage_events_select" ON public.ai_usage_events
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "auth_ai_usage_events_all" ON public.ai_usage_events;
CREATE POLICY "auth_ai_usage_events_all" ON public.ai_usage_events
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

------------------------------------------------------------
-- 2) usage_rollup_minute (instant counters + top models)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_rollup_minute (
  bucket_minute timestamptz NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  agent_id uuid,
  project_id uuid,
  tokens int NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  calls int NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_minute, provider, model, agent_id, project_id)
);

ALTER TABLE public.usage_rollup_minute ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_usage_rollup_minute_select" ON public.usage_rollup_minute;
CREATE POLICY "anon_usage_rollup_minute_select" ON public.usage_rollup_minute
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "auth_usage_rollup_minute_all" ON public.usage_rollup_minute;
CREATE POLICY "auth_usage_rollup_minute_all" ON public.usage_rollup_minute
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.rollup_ai_usage_event()
RETURNS TRIGGER AS $$
DECLARE
  b timestamptz;
  t int;
  c numeric;
BEGIN
  b := date_trunc('minute', NEW.created_at);
  t := COALESCE(NEW.total_tokens, 0);
  c := COALESCE(NEW.cost_usd, 0);

  INSERT INTO public.usage_rollup_minute (
    bucket_minute, provider, model, agent_id, project_id, tokens, cost_usd, calls
  ) VALUES (
    b, NEW.provider, NEW.model, NEW.agent_id, NEW.project_id, t, c, 1
  )
  ON CONFLICT (bucket_minute, provider, model, agent_id, project_id)
  DO UPDATE SET
    tokens = usage_rollup_minute.tokens + EXCLUDED.tokens,
    cost_usd = usage_rollup_minute.cost_usd + EXCLUDED.cost_usd,
    calls = usage_rollup_minute.calls + EXCLUDED.calls;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rollup_ai_usage_events ON public.ai_usage_events;
CREATE TRIGGER trg_rollup_ai_usage_events
AFTER INSERT ON public.ai_usage_events
FOR EACH ROW EXECUTE FUNCTION public.rollup_ai_usage_event();

------------------------------------------------------------
-- 3) progress_pct fields for instant project/sprint progress bars
------------------------------------------------------------
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS progress_pct int NOT NULL DEFAULT 0;
ALTER TABLE public.sprints  ADD COLUMN IF NOT EXISTS progress_pct int NOT NULL DEFAULT 0;

-- Allow anon SELECT for realtime UI.
-- (Existing tables already have RLS; these policies are additive.)
DROP POLICY IF EXISTS "anon_projects_select" ON public.projects;
CREATE POLICY "anon_projects_select" ON public.projects
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_sprints_select" ON public.sprints;
CREATE POLICY "anon_sprints_select" ON public.sprints
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_sprint_items_select" ON public.sprint_items;
CREATE POLICY "anon_sprint_items_select" ON public.sprint_items
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_agents_select" ON public.agents;
CREATE POLICY "anon_agents_select" ON public.agents
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_jobs_select" ON public.jobs;
CREATE POLICY "anon_jobs_select" ON public.jobs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_agent_events_select" ON public.agent_events;
CREATE POLICY "anon_agent_events_select" ON public.agent_events
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_approvals_select" ON public.approvals;
CREATE POLICY "anon_approvals_select" ON public.approvals
  FOR SELECT USING (true);

-- Recalc helper for a sprint
CREATE OR REPLACE FUNCTION public.recalc_sprint_progress(p_sprint_id uuid)
RETURNS void AS $$
DECLARE
  total_count int;
  done_count int;
  pct int;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'done')
    INTO total_count, done_count
  FROM public.sprint_items
  WHERE sprint_id = p_sprint_id;

  IF total_count = 0 THEN
    pct := 0;
  ELSE
    pct := ROUND((done_count::numeric / total_count::numeric) * 100);
  END IF;

  UPDATE public.sprints
  SET progress_pct = pct,
      updated_at = now()
  WHERE id = p_sprint_id;
END;
$$ LANGUAGE plpgsql;

-- Recalc helper for project: based on ACTIVE sprint done/total, fallback = 0
CREATE OR REPLACE FUNCTION public.recalc_project_progress(p_project_id uuid)
RETURNS void AS $$
DECLARE
  active_sprint_id uuid;
BEGIN
  SELECT id INTO active_sprint_id
  FROM public.sprints
  WHERE project_id = p_project_id AND status = 'active'
  ORDER BY start_date DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF active_sprint_id IS NULL THEN
    UPDATE public.projects
    SET progress_pct = 0,
        updated_at = now()
    WHERE id = p_project_id;
    RETURN;
  END IF;

  PERFORM public.recalc_sprint_progress(active_sprint_id);

  UPDATE public.projects p
  SET progress_pct = s.progress_pct,
      updated_at = now()
  FROM public.sprints s
  WHERE p.id = p_project_id AND s.id = active_sprint_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.on_sprint_item_change_recalc_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- sprint progress
  IF (TG_OP = 'INSERT') THEN
    PERFORM public.recalc_sprint_progress(NEW.sprint_id);
    PERFORM public.recalc_project_progress(NEW.project_id);
  ELSE
    PERFORM public.recalc_sprint_progress(COALESCE(NEW.sprint_id, OLD.sprint_id));
    PERFORM public.recalc_project_progress(COALESCE(NEW.project_id, OLD.project_id));
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalc_progress_on_sprint_items ON public.sprint_items;
CREATE TRIGGER trg_recalc_progress_on_sprint_items
AFTER INSERT OR UPDATE OF status OR DELETE ON public.sprint_items
FOR EACH ROW EXECUTE FUNCTION public.on_sprint_item_change_recalc_progress();

COMMIT;

-- Agent identity improvements
-- Adds title + primary_team_id to agents for first-class display

BEGIN;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS primary_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

COMMIT;

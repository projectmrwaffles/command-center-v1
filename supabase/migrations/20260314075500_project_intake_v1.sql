-- Store structured intake data for the redesigned project intake form
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS intake jsonb,
  ADD COLUMN IF NOT EXISTS intake_summary text;

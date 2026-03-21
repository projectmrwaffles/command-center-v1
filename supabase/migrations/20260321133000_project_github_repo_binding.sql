ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS github_repo_binding jsonb;

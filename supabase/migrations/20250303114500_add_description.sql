-- Add description column to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description text;

-- 02_projects.sql - Update existing projects with type + team_id
UPDATE public.projects
SET type = 'engineering', team_id = 'aaaaaaaa-bbbb-cccc-dddd-111111111111', updated_at = now()
WHERE id = '11111111-1111-1111-1111-111111111111';

UPDATE public.projects
SET type = 'marketing', team_id = 'aaaaaaaa-bbbb-cccc-dddd-222222222222', updated_at = now()
WHERE id = '22222222-2222-2222-2222-222222222222';
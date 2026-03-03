-- Command Center V1 Seed Data
-- Generated from supabase/seed/*.sql files
-- Teams, team_members, projects metadata, sprints, sprint_items, PRDs, jobs, approvals, events, usage

-- NOTE: This seed assumes the base seed (supabase/seed.sql) has already inserted:
-- - agents (AgentA/B/C)
-- - projects (Command Center V1, Marketing Site)
-- - jobs (eeee0001..eeee0005)
-- - approvals (pending)
-- - agent_events + ai_usage basic

-- File: supabase/seed/01_teams.sql
-- 01_teams.sql - Teams and team_members
INSERT INTO public.teams (id, name, description, settings) VALUES
  ('aaaaaaaa-bbbb-cccc-dddd-111111111111', 'Engineering', 'Core product engineering team', '{"emoji":"⚙️"}'::jsonb),
  ('aaaaaaaa-bbbb-cccc-dddd-222222222222', 'Marketing', 'Marketing and growth team', '{"emoji":"📢"}'::jsonb)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.agents (id, name, type, status, last_seen) VALUES
  ('dddddddd-eeee-ffff-1111-000000000001', 'AgentD', 'sub', 'active', now()),
  ('dddddddd-eeee-ffff-1111-000000000002', 'AgentE', 'sub', 'idle', now() - interval '2 hours')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.team_members (team_id, agent_id, role) VALUES
  ('aaaaaaaa-bbbb-cccc-dddd-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lead'),
  ('aaaaaaaa-bbbb-cccc-dddd-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member'),
  ('aaaaaaaa-bbbb-cccc-dddd-111111111111', 'dddddddd-eeee-ffff-1111-000000000001', 'member'),
  ('aaaaaaaa-bbbb-cccc-dddd-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member'),
  ('aaaaaaaa-bbbb-cccc-dddd-222222222222', 'dddddddd-eeee-ffff-1111-000000000002', 'member')
ON CONFLICT DO NOTHING;
-- File: supabase/seed/02_projects.sql
-- 02_projects.sql - Update existing projects with type + team_id
UPDATE public.projects
SET type = 'engineering', team_id = 'aaaaaaaa-bbbb-cccc-dddd-111111111111', updated_at = now()
WHERE id = '11111111-1111-1111-1111-111111111111';

UPDATE public.projects
SET type = 'marketing', team_id = 'aaaaaaaa-bbbb-cccc-dddd-222222222222', updated_at = now()
WHERE id = '22222222-2222-2222-2222-222222222222';
-- File: supabase/seed/03_prds.sql
-- 03_prds.sql - PRDs
INSERT INTO public.prds (id, project_id, title, body_markdown, status, created_by_agent_id, created_at) VALUES
  ('d0d00001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'Command Center V0.1', '# V0.1 Goals\n\n- Basic dashboard\n- Agent tracking\n- Usage view', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '14 days'),
  ('d0d00002-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Command Center V1.0', '# V1.0 Goals\n\n- Teams\n- PRDs\n- Sprints\n- Better UX', 'draft', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now()),
  ('d0d00003-0003-0003-0003-000000000003', '22222222-2222-2222-2222-222222222222', 'Marketing Site V1', '# Marketing Site PRD\n\n- Landing page\n- SEO\n- Content', 'active', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() - interval '7 days')
ON CONFLICT (id) DO NOTHING;
-- File: supabase/seed/04_sprints.sql
-- 04_sprints.sql - Sprints
INSERT INTO public.sprints (id, project_id, name, goal, start_date, end_date, status) VALUES
  ('00000001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'Sprint 1', 'Dashboard MVP', (now() - interval '14 days')::date, (now() - interval '7 days')::date, 'completed'),
  ('00000001-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Sprint 2', 'Command Center V1 Build', (now() - interval '2 days')::date, (now() + interval '12 days')::date, 'active'),
  ('00000002-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'Landing Page Sprint', 'Finish landing page', (now() - interval '5 days')::date, (now() + interval '2 days')::date, 'active')
ON CONFLICT (id) DO NOTHING;
-- File: supabase/seed/05_sprint_items.sql
-- 05_sprint_items.sql - Sprint items
-- Project 1: 8 items, 5 done
INSERT INTO public.sprint_items (id, sprint_id, project_id, title, status, assignee_agent_id, position) VALUES
  ('a0000001-0001-0001-0001-000000000001', '00000001-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Schema migration', 'done', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1),
  ('a0000002-0002-0002-0002-000000000002', '00000001-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Design system tokens', 'done', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2),
  ('a0000003-0003-0003-0003-000000000003', '00000001-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Mobile bottom tabs', 'done', 'dddddddd-eeee-ffff-1111-000000000001', 3),
  ('a0000004-0004-0004-0004-000000000004', '00000001-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Sidebar polish', 'done', 'dddddddd-eeee-ffff-1111-000000000001', 4),
  ('a0000005-0005-0005-0005-000000000005', '00000001-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Teams grid layout', 'done', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5),
  ('a0000006-0006-0006-0006-000000000006', '00000001-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Needs You drawer', 'in_progress', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 6),
  ('a0000007-0007-0007-0007-000000000007', '00000001-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Usage charts', 'todo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 7),
  ('a0000008-0008-0008-0008-000000000008', '00000001-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'PRD submission flow', 'todo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 8)
ON CONFLICT (id) DO NOTHING;

-- Project 2: 5 items
INSERT INTO public.sprint_items (id, sprint_id, project_id, title, status, assignee_agent_id, position) VALUES
  ('a0000009-0009-0009-0009-000000000009', '00000002-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'Hero section', 'done', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1),
  ('a0000010-0010-0010-0010-000000000010', '00000002-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'Features grid', 'done', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 2),
  ('a0000011-0011-0011-0011-000000000011', '00000002-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'Landing page final', 'blocked', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 3),
  ('a0000012-0012-0012-0012-000000000012', '00000002-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'Pricing table', 'in_progress', 'dddddddd-eeee-ffff-1111-000000000002', 4),
  ('a0000013-0013-0013-0013-000000000013', '00000002-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'SEO metadata', 'todo', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 5)
ON CONFLICT (id) DO NOTHING;

-- File: supabase/seed/06_jobs.sql
-- 06_jobs.sql - Link existing jobs to PRDs + create new jobs
UPDATE public.jobs SET prd_id = 'd0d00001-0001-0001-0001-000000000001' WHERE id = 'eeee0001-0001-0001-0001-000000000001';
UPDATE public.jobs SET prd_id = 'd0d00002-0002-0002-0002-000000000002' WHERE id = 'eeee0002-0002-0002-0002-000000000002';
UPDATE public.jobs SET prd_id = 'd0d00002-0002-0002-0002-000000000002' WHERE id = 'eeee0003-0003-0003-0003-000000000003';
UPDATE public.jobs SET prd_id = 'd0d00003-0003-0003-0003-000000000003' WHERE id = 'eeee0004-0004-0004-0004-000000000004';
UPDATE public.jobs SET prd_id = 'd0d00003-0003-0003-0003-000000000003' WHERE id = 'eeee0005-0005-0005-0005-000000000005';

INSERT INTO public.jobs (id, project_id, prd_id, title, status, owner_agent_id, summary) VALUES
  ('eeee0006-0006-0006-0006-000000000006', '11111111-1111-1111-1111-111111111111', 'd0d00002-0002-0002-0002-000000000002', 'Implement Teams page', 'queued', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Build teams list with members and usage rollup'),
  ('eeee0007-0007-0007-0007-000000000007', '11111111-1111-1111-1111-111111111111', 'd0d00002-0002-0002-0002-000000000002', 'Overview page redesign', 'queued', 'dddddddd-eeee-ffff-1111-000000000001', '2-col grid layout with Needs You queue'),
  ('eeee0008-0008-0008-0008-000000000008', '22222222-2222-2222-2222-222222222222', 'd0d00003-0003-0003-0003-000000000003', 'Finalize landing page', 'waiting_approval', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Landing page ready for final approval')
ON CONFLICT (id) DO NOTHING;
-- File: supabase/seed/07_approvals.sql
-- 07_approvals.sql - Enrich existing approvals + add new ones
UPDATE public.approvals
SET project_id = '22222222-2222-2222-2222-222222222222', requester_name = 'AgentC', severity = 'medium'
WHERE id IN (SELECT id FROM public.approvals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1);

INSERT INTO public.approvals (id, job_id, agent_id, project_id, status, summary, requester_name, severity) VALUES
  ('00000002-0002-0002-0002-000000000002', 'eeee0008-0008-0008-0008-000000000008', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'pending', 'Finalize landing page for launch approval', 'AgentC', 'high')
ON CONFLICT (id) DO NOTHING;
-- File: supabase/seed/08_usage.sql
-- 08_usage.sql - AI usage for 24h stats + top models
INSERT INTO public.ai_usage (agent_id, project_id, job_id, provider, model, tokens_in, tokens_out, total_tokens, cost_usd, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'eeee0006-0006-0006-0006-000000000006', 'openai', 'gpt-4', 1200, 450, 1650, 0.0480, now() - interval '10 minutes'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'eeee0007-0007-0007-0007-000000000007', 'openai', 'gpt-4', 850, 320, 1170, 0.0341, now() - interval '8 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', NULL, 'openai', 'gpt-4', 2100, 890, 2990, 0.0872, now() - interval '5 minutes'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'eeee0008-0008-0008-0008-000000000008', 'anthropic', 'claude-3-opus', 3400, 1200, 4600, 0.138, now() - interval '15 minutes'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', NULL, 'anthropic', 'claude-3-sonnet', 680, 340, 1020, 0.0184, now() - interval '12 minutes')
ON CONFLICT DO NOTHING;
-- File: supabase/seed/09_events.sql
-- 09_events.sql - Agent events with human-readable payloads
INSERT INTO public.agent_events (agent_id, project_id, job_id, event_type, payload, timestamp) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'eeee0006-0006-0006-0006-000000000006', 'JOB_STATUS_CHANGED', '{"old":"queued","new":"in_progress","project_name":"Command Center V1","job_title":"Implement Teams page"}', now() - interval '2 hours'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'eeee0007-0007-0007-0007-000000000007', 'JOB_STATUS_CHANGED', '{"old":"queued","new":"in_progress","project_name":"Command Center V1","job_title":"Overview page redesign"}', now() - interval '30 minutes'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'eeee0008-0008-0008-0008-000000000008', 'APPROVAL_REQUESTED', '{"summary":"Finalize landing page for launch","project_name":"Marketing Site","requester":"AgentC"}', now() - interval '1 hour'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, NULL, 'HEARTBEAT', '{"status":"active","version":"1.0","agent_name":"AgentA"}', now() - interval '5 minutes'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NULL, NULL, 'HEARTBEAT', '{"status":"active","version":"1.0","agent_name":"AgentB"}', now() - interval '6 minutes'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', NULL, NULL, 'HEARTBEAT', '{"status":"idle","version":"1.0","agent_name":"AgentC"}', now() - interval '4 minutes'),
  ('dddddddd-eeee-ffff-1111-000000000001', NULL, NULL, 'HEARTBEAT', '{"status":"active","version":"1.0","agent_name":"AgentD"}', now() - interval '2 minutes'),
  ('dddddddd-eeee-ffff-1111-000000000002', NULL, NULL, 'HEARTBEAT', '{"status":"idle","version":"1.0","agent_name":"AgentE"}', now() - interval '8 minutes')
ON CONFLICT DO NOTHING;

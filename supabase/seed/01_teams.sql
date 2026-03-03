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
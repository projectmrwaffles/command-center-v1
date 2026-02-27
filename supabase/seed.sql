-- Seed: 3 agents, 2 projects, 5 jobs, sample events
-- Using service_role to bypass RLS for seeding

-- Agents
insert into public.agents (id, name, type, status, last_seen) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'AgentA', 'primary', 'active', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'AgentB', 'sub', 'active', now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'AgentC', 'sub', 'idle', now() - interval '1 hour');

-- Projects
insert into public.projects (id, name, project_type, status) values
  ('11111111-1111-1111-1111-111111111111', 'Command Center V1', 'engineering', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Marketing Site', 'marketing', 'active');

-- Jobs
insert into public.jobs (id, project_id, title, status, owner_agent_id) values
  ('eeee0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'Scaffold repo', 'completed', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('eeee0002-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Schema migration', 'in_progress', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('eeee0003-0003-0003-0003-000000000003', '11111111-1111-1111-1111-111111111111', 'RLS policies', 'queued', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('eeee0004-0004-0004-0004-000000000004', '22222222-2222-2222-2222-222222222222', 'Landing page', 'waiting_approval', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('eeee0005-0005-0005-0005-000000000005', '22222222-2222-2222-2222-222222222222', 'SEO audit', 'queued', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Events
insert into public.agent_events (agent_id, project_id, job_id, event_type, payload) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'eeee0001-0001-0001-0001-000000000001', 'JOB_STATUS_CHANGED', '{"old":"queued","new":"completed"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'eeee0004-0004-0004-0004-000000000004', 'APPROVAL_REQUESTED', '{"summary":"Landing page ready for review"}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, null, 'HEARTBEAT', '{"status":"active"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, null, 'HEARTBEAT', '{"status":"active"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', null, null, 'HEARTBEAT', '{"status":"idle"}');

-- AI Usage
insert into public.ai_usage (agent_id, project_id, job_id, provider, model, tokens_in, tokens_out, total_tokens, cost_usd) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'eeee0001-0001-0001-0001-000000000001', 'openai', 'gpt-4', 500, 200, 700, 0.021),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'eeee0004-0004-0004-0004-000000000004', 'anthropic', 'claude-3', 800, 400, 1200, 0.036);

-- Approvals
insert into public.approvals (job_id, agent_id, status, summary) values
  ('eeee0004-0004-0004-0004-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pending', 'Landing page ready for review');

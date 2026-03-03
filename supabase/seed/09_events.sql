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
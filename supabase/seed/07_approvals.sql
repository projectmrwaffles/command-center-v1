-- 07_approvals.sql - Enrich existing approvals + add new ones
UPDATE public.approvals
SET project_id = '22222222-2222-2222-2222-222222222222', requester_name = 'AgentC', severity = 'medium'
WHERE id IN (SELECT id FROM public.approvals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1);

INSERT INTO public.approvals (id, job_id, agent_id, project_id, status, summary, requester_name, severity) VALUES
  ('00000002-0002-0002-0002-000000000002', 'eeee0008-0008-0008-0008-000000000008', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'pending', 'Finalize landing page for launch approval', 'AgentC', 'high')
ON CONFLICT (id) DO NOTHING;
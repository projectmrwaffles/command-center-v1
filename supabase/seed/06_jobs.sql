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
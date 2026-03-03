-- 03_prds.sql - PRDs
INSERT INTO public.prds (id, project_id, title, body_markdown, status, created_by_agent_id, created_at) VALUES
  ('d0d00001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'Command Center V0.1', '# V0.1 Goals\n\n- Basic dashboard\n- Agent tracking\n- Usage view', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '14 days'),
  ('d0d00002-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Command Center V1.0', '# V1.0 Goals\n\n- Teams\n- PRDs\n- Sprints\n- Better UX', 'draft', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now()),
  ('d0d00003-0003-0003-0003-000000000003', '22222222-2222-2222-2222-222222222222', 'Marketing Site V1', '# Marketing Site PRD\n\n- Landing page\n- SEO\n- Content', 'active', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() - interval '7 days')
ON CONFLICT (id) DO NOTHING;
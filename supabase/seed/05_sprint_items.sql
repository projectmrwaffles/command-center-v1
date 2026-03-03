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

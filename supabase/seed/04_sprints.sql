-- 04_sprints.sql - Sprints
INSERT INTO public.sprints (id, project_id, name, goal, start_date, end_date, status) VALUES
  ('00000001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'Sprint 1', 'Dashboard MVP', (now() - interval '14 days')::date, (now() - interval '7 days')::date, 'completed'),
  ('00000001-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Sprint 2', 'Command Center V1 Build', (now() - interval '2 days')::date, (now() + interval '12 days')::date, 'active'),
  ('00000002-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'Landing Page Sprint', 'Finish landing page', (now() - interval '5 days')::date, (now() + interval '2 days')::date, 'active')
ON CONFLICT (id) DO NOTHING;
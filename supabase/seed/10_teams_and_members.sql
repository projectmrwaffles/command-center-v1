-- Seed teams and team members
-- Teams
INSERT INTO public.teams (id, name, description) VALUES
  ('11111111-1111-1111-1111-000000000001', 'Engineering', 'Development and technical work'),
  ('11111111-1111-1111-1111-000000000002', 'Design', 'UX/UI and visual design'),
  ('11111111-1111-1111-1111-000000000003', 'Product', 'Product management and strategy'),
  ('11111111-1111-1111-1111-000000000004', 'Marketing', 'Growth and marketing'),
  ('11111111-1111-1111-1111-000000000005', 'QA', 'Quality assurance and testing')
ON CONFLICT (id) DO NOTHING;

-- Team Members (assign agents to teams)
INSERT INTO public.team_members (team_id, agent_id, role) VALUES
  -- Engineering
  ('11111111-1111-1111-1111-000000000001', 'tech-lead-architect', 'lead'),
  ('11111111-1111-1111-1111-000000000001', 'frontend-engineer', 'member'),
  ('11111111-1111-1111-1111-000000000001', 'backend-engineer', 'member'),
  ('11111111-1111-1111-1111-000000000001', 'mobile-engineer', 'member'),
  ('11111111-1111-1111-1111-000000000001', 'qa-auditor', 'member'),
  -- Design
  ('11111111-1111-1111-1111-000000000002', 'head-of-design', 'lead'),
  ('11111111-1111-1111-1111-000000000002', 'product-designer-app', 'member'),
  ('11111111-1111-1111-1111-000000000002', 'web-designer-marketing', 'member'),
  -- Product
  ('11111111-1111-1111-1111-000000000003', 'product-lead', 'lead'),
  -- Marketing
  ('11111111-1111-1111-1111-000000000004', 'growth-lead', 'lead'),
  ('11111111-1111-1111-1111-000000000004', 'marketing-producer', 'member'),
  ('11111111-1111-1111-1111-000000000004', 'marketing-ops-analytics', 'member'),
  -- QA (additional)
  ('11111111-1111-1111-1111-000000000005', 'qa-auditor', 'lead')
ON CONFLICT DO NOTHING;

-- Verify
SELECT t.name as team, tm.agent_id, tm.role 
FROM public.team_members tm 
JOIN public.teams t ON t.id = tm.team_id 
ORDER BY t.name, tm.role;

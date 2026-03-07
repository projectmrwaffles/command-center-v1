-- Update agents table with real OpenClaw agents
-- Replace placeholder agents with actual OpenClaw agent configuration

-- First, clear existing agents
DELETE FROM public.agents WHERE name IN ('AgentD', 'AgentE', 'Alpha', 'Bravo', 'Charlie');

-- Insert real OpenClaw agents (using deterministic UUIDs based on agent names)
INSERT INTO public.agents (id, name, type, status, last_seen) VALUES
  ('11111111-1111-1111-1111-000000000001', 'main', 'primary', 'active', now()),
  ('11111111-1111-1111-1111-000000000002', 'product-lead', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000003', 'head-of-design', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000004', 'product-designer-app', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000005', 'web-designer-marketing', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000006', 'tech-lead-architect', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000007', 'frontend-engineer', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000008', 'backend-engineer', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000009', 'mobile-engineer', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000010', 'seo-web-developer', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000011', 'growth-lead', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000012', 'marketing-producer', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000013', 'marketing-ops-analytics', 'sub', 'idle', now()),
  ('11111111-1111-1111-1111-000000000014', 'qa-auditor', 'sub', 'idle', now())
ON CONFLICT (name) DO UPDATE SET
  type = EXCLUDED.type,
  status = EXCLUDED.status,
  last_seen = EXCLUDED.last_seen;

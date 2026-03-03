-- 08_usage.sql - AI usage for 24h stats + top models
INSERT INTO public.ai_usage (agent_id, project_id, job_id, provider, model, tokens_in, tokens_out, total_tokens, cost_usd, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'eeee0006-0006-0006-0006-000000000006', 'openai', 'gpt-4', 1200, 450, 1650, 0.0480, now() - interval '10 minutes'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'eeee0007-0007-0007-0007-000000000007', 'openai', 'gpt-4', 850, 320, 1170, 0.0341, now() - interval '8 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', NULL, 'openai', 'gpt-4', 2100, 890, 2990, 0.0872, now() - interval '5 minutes'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'eeee0008-0008-0008-0008-000000000008', 'anthropic', 'claude-3-opus', 3400, 1200, 4600, 0.138, now() - interval '15 minutes'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', NULL, 'anthropic', 'claude-3-sonnet', 680, 340, 1020, 0.0184, now() - interval '12 minutes')
ON CONFLICT DO NOTHING;
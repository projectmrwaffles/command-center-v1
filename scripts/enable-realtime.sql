-- Enable Realtime on tables for instant UI updates

-- 1) Enable realtime extension if not already enabled
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'realtime') THEN
    CREATE EXTENSION IF NOT EXISTS realtime;
  END IF;
END
$$;

-- 2) Add tables to realtime publication (requires superuser or owner)
-- Note: In Supabase hosted, this is done via the dashboard's "Realtime" section
-- or via the Database → Replication menu.
-- The pg_net extension cannot be used to enable replication.
-- This script documents what SHOULD be done:

-- Via Studio UI (Database → Replication) manually enable:
-- agents, agent_events, ai_usage_events, ai_usage, approvals,
-- jobs, projects, sprints, sprint_items, usage_rollup_minute

-- Or use the Supabase CLI with owner permissions:
-- supabase realtime enable tables [table_names...]

-- For scripted access, use REST API (requires service_role):
-- POST https://api.supabase.com/v1/projects/{ref}/config/postgres/replication
-- with Authorization: Bearer {service_key}
-- body: {"tables": [...]}

-- 3) Verify publication exists
-- SELECT pubname FROM pg_publication WHERE pubname = 'supabase_realtime';

-- 4) Add tables to publication (only works with OWNER permissions):
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_events;
-- ... etc

-- 5) Also ensure RLS allows SELECT for anon key (already done in migration)
SELECT 'Realtime tables should be enabled via Supabase Studio' as note;

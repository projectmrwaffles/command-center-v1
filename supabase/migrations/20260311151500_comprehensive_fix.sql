-- Comprehensive schema fix for project creation flow
-- Run this once to fix all issues

-- 1. Allow NULL in sprint_id (we're not using sprints anymore)
ALTER TABLE public.sprint_items ALTER COLUMN sprint_id DROP NOT NULL;

-- 2. RLS for team_members - allow anon to read
DROP POLICY IF EXISTS "Allow anon team_members" ON public.team_members;
CREATE POLICY "Allow anon team_members" ON public.team_members
  FOR SELECT TO anon USING (true);

-- 3. RLS for sprint_items - allow anon to insert and read
DROP POLICY IF EXISTS "Allow anon sprint_items_insert" ON public.sprint_items;
DROP POLICY IF EXISTS "Allow anon sprint_items_select" ON public.sprint_items;

CREATE POLICY "Allow anon sprint_items_insert" ON public.sprint_items
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon sprint_items_select" ON public.sprint_items
  FOR SELECT TO anon USING (true);

-- 4. RLS for agent_events - allow anon to insert
DROP POLICY IF EXISTS "Allow anon agent_events_insert" ON public.agent_events;
CREATE POLICY "Allow anon agent_events_insert" ON public.agent_events
  FOR INSERT TO anon WITH CHECK (true);

-- 5. RLS for teams - allow anon to read (if not already)
DROP POLICY IF EXISTS "Allow anon teams" ON public.teams;
CREATE POLICY "Allow anon teams" ON public.teams
  FOR SELECT TO anon USING (true);

-- Verify settings
SELECT 
  'sprint_items sprint_id nullable' as check,
  is_nullable = 'YES' as result
FROM information_schema.columns 
WHERE table_name = 'sprint_items' AND column_name = 'sprint_id';
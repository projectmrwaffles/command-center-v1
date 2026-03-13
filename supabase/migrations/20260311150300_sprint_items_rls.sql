-- Allow anon to insert sprint_items (needed for project creation)
-- And select for reading tasks

DROP POLICY IF EXISTS "Allow anon insert sprint_items" ON public.sprint_items;
DROP POLICY IF EXISTS "Allow anon select sprint_items" ON public.sprint_items;

CREATE POLICY "Allow anon insert sprint_items" ON public.sprint_items
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon select sprint_items" ON public.sprint_items
  FOR SELECT TO anon USING (true);
-- Allow authenticated users to read team_members
-- This is needed for project creation to assign tasks to team members

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow read access to team_members" ON public.team_members;

-- Create a policy that allows all authenticated users to read
CREATE POLICY "Allow read access to team_members" ON public.team_members
  FOR SELECT
  TO authenticated
  USING (true);

-- Also allow anon for this specific use case
CREATE POLICY "Allow anon read access to team_members" ON public.team_members
  FOR SELECT
  TO anon
  USING (true);
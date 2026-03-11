-- Fix: Remove SECURITY DEFINER from approval_requests view
-- SECURITY DEFINER bypasses RLS, exposing data without proper access controls

-- Drop and recreate without SECURITY DEFINER (PostgreSQL doesn't support ALTER VIEW for this)
DROP VIEW IF EXISTS public.approval_requests;

CREATE VIEW public.approval_requests AS
  SELECT * FROM public.approvals;

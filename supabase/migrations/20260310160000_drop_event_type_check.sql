-- Drop the restrictive check constraint on agent_events.event_type
-- Run this in Supabase SQL Editor to enable all event types

ALTER TABLE public.agent_events DROP CONSTRAINT IF EXISTS agent_events_event_type_check;
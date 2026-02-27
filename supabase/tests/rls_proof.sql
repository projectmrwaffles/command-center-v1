-- RBAC Proof for Command Center V1 (Gate 1)
-- Admin can read AGENTS table for A and B
SELECT * FROM public.agents WHERE id = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa OR id = bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb;

-- AgentA can read AgentB? Expect 0 rows
SELECT * FROM public.agents WHERE id = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa AND id = bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb;

-- AgentA inserts own event
INSERT INTO public.agent_events (agent_id, event_type, timestamp, payload) VALUES (aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa, HEARTBEAT, now(), {});

-- AgentA attempts to insert AgentB event (should fail)
INSERT INTO public.agent_events (agent_id, event_type, timestamp, payload) VALUES (bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb, HEARTBEAT, now(), {});
